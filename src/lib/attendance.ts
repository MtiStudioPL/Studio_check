import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Obecnosc } from "@/db/schema";
import { verifyDoorToken } from "./doorToken";
import { config } from "./config";
import { checkinInQuiet, getCisza, getDoorVersion } from "./settings";
import { inQuiet } from "./time";
import { HttpError, type User } from "./errors";
import { writeAudit } from "./audit";
import { enqueueAdmin } from "./mail";
import { itemsOf, view } from "./equipment";
import * as T from "./templates";

export function visitView(o: Obecnosc) {
  return {
    id: o.id,
    imie: o.imie,
    email: o.email,
    wejscie: o.wejscie.toISOString(),
    wyjscie: o.wyjscie?.toISOString() ?? null,
    auto: o.zrodloWyjscia === "auto",
    zamknietaPrzez: o.zamknietaPrzez,
    sprzetPrzyWyjsciu: o.sprzetPrzyWyjsciu ?? [],
  };
}

export async function openVisit(oid: string) {
  const [o] = await db.select().from(schema.obecnosci).where(and(eq(schema.obecnosci.userOid, oid), isNull(schema.obecnosci.wyjscie)));
  return o ?? null;
}

export async function validateDoorToken(token: string) {
  const r = verifyDoorToken(token, config.doorSecret, await getDoorVersion());
  return r;
}

export async function checkIn(user: User, token: string, ip: string | null) {
  const v = await validateDoorToken(token);
  if (!v.ok) {
    await writeAudit({ userOid: user.oid, zdarzenie: "checkin", wynik: "odmowa", szczegoly: { powod: v.reason }, ip });
    const msg = v.reason === "wygasl" ? "Kod wygasł. Zeskanuj kod z tabletu jeszcze raz." : "Ten kod drzwi jest nieważny. Zeskanuj aktualny kod przy wejściu do studia.";
    throw new HttpError(400, "zly_kod_drzwi", msg);
  }

  const existing = await openVisit(user.oid);
  if (existing) return { wizyta: visitView(existing), juz: true };

  const now = new Date();
  const cisza = await getCisza();
  const wCiszy = inQuiet(now, cisza.od, cisza.do);
  if (wCiszy && (await checkinInQuiet()) === "odrzucaj") {
    await writeAudit({ userOid: user.oid, zdarzenie: "checkin", wynik: "odmowa", szczegoly: { powod: "cisza" }, ip });
    throw new HttpError(403, "cisza", `Studio jest zamknięte w godzinach ${cisza.od}–${cisza.do}.`);
  }

  try {
    const o = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(schema.obecnosci)
        .values({ userOid: user.oid, email: user.email, imie: user.name, wejscie: now, zrodloWejscia: v.kind })
        .returning();
      if (wCiszy) await enqueueAdmin({ ...T.mailCheckinWCiszy({ imie: user.name, email: user.email, kiedy: now }), rodzaj: "checkin_cisza" }, tx);
      return o;
    });
    return { wizyta: visitView(o), juz: false };
  } catch (e) {
    // Wyścig dwóch skanów: częściowy indeks unikalny wpuszcza tylko jedną otwartą wizytę.
    const again = await openVisit(user.oid);
    if (again) return { wizyta: visitView(again), juz: true };
    throw e;
  }
}

/** Check-out. Bez potwierdzenia, gdy osoba ma sprzęt — zwraca listę i prosi o decyzję (wyjście nie jest blokowane). */
export async function checkOut(user: User, potwierdzam: boolean, zrodlo: "aplikacja" | "kod_drzwi" = "aplikacja") {
  const o = await openVisit(user.oid);
  if (!o) throw new HttpError(409, "brak_wizyty", "Nie masz otwartej wizyty w studiu.");
  const items = await itemsOf(user.email);
  if (items.length && !potwierdzam) {
    return { wymagaPotwierdzenia: true, sprzet: items.map(view), wizyta: visitView(o) };
  }
  const [closed] = await db
    .update(schema.obecnosci)
    .set({ wyjscie: new Date(), zrodloWyjscia: zrodlo, sprzetPrzyWyjsciu: items.map((i) => i.kod) })
    .where(and(eq(schema.obecnosci.id, o.id), isNull(schema.obecnosci.wyjscie)))
    .returning();
  if (!closed) throw new HttpError(409, "brak_wizyty", "Wizyta została już zamknięta.");
  return { wymagaPotwierdzenia: false, sprzet: items.map(view), wizyta: visitView(closed) };
}

export async function whoIsIn() {
  const rows = await db.select().from(schema.obecnosci).where(isNull(schema.obecnosci.wyjscie)).orderBy(schema.obecnosci.wejscie);
  return rows.map((o) => ({ id: o.id, imie: o.imie, wejscie: o.wejscie.toISOString() }));
}

export async function myVisits(oid: string) {
  const rows = await db
    .select()
    .from(schema.obecnosci)
    .where(and(eq(schema.obecnosci.userOid, oid), gte(schema.obecnosci.wejscie, sql`now() - interval '30 days'`)))
    .orderBy(desc(schema.obecnosci.wejscie))
    .limit(100);
  return rows.map(visitView);
}

export async function adminCloseVisit(admin: User, id: number, powod: string, ip: string | null) {
  const [o] = await db
    .update(schema.obecnosci)
    .set({ wyjscie: new Date(), zrodloWyjscia: "admin", zamknietaPrzez: admin.email })
    .where(and(eq(schema.obecnosci.id, id), isNull(schema.obecnosci.wyjscie)))
    .returning();
  if (!o) throw new HttpError(404, "nie_ma", "Nie ma otwartej wizyty o tym numerze.");
  await writeAudit({ userOid: admin.oid, zdarzenie: "admin_zamkniecie_wizyty", obiekt: `${o.id}:${o.email}`, szczegoly: { powod }, wynik: "ok", ip });
  return visitView(o);
}
