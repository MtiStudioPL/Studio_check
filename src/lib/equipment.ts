import "server-only";
import { and, asc, desc, eq, ilike, ne, or, sql, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { Sprzet } from "@/db/schema";
import { enqueueAdmin, enqueueMail } from "./mail";
import * as T from "./templates";
import { hit } from "./ratelimit";
import { writeAudit } from "./audit";
import { HttpError, type User } from "./errors";
import { fmtDateTime, fmtTime } from "./time";
import { upcomingByItem } from "./reservations";

export const AKCJE = { biore: "Biorę", oddaje: "Oddaję", sprawdzam: "Sprawdzam" } as const;
export type AkcjaKey = keyof typeof AKCJE;

/** Pozycja w formie dla frontu. */
export function view(s: Sprzet) {
  return {
    kod: s.kod,
    nazwa: s.nazwa,
    kategoria: s.kategoria,
    maQr: s.maQr,
    status: s.status,
    ktoMa: s.ktoMa,
    email: s.email,
    odKiedy: s.odKiedy?.toISOString() ?? null,
    jest: s.jest,
    sprawdzono: s.sprawdzono?.toISOString() ?? null,
    miejsce: s.miejsce,
    planowanyZwrot: s.planowanyZwrot,
  };
}
export type SprzetView = ReturnType<typeof view> & { rezerwacja?: { imie: string; email: string; od: string; do: string } | null };

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505");

export type ActionInput = { kod: number; akcja: AkcjaKey; uwagi?: string | null; requestId: string };
export type ActionResult = { pozycja: SprzetView | null; nieznany?: boolean; duplikat?: boolean; ostrzezenie?: string };

/**
 * Biorę / Oddaję / Sprawdzam — logika 1:1 ze specyfikacji, w jednej transakcji:
 * blokada wiersza → zmiana stanu → wpis do Historii → maile do kolejki.
 */
export async function performAction(user: User, input: ActionInput, zrodlo = "aplikacja"): Promise<ActionResult> {
  const uwagi = input.uwagi?.trim() ? input.uwagi.trim().slice(0, 500) : null;
  const label = AKCJE[input.akcja];

  const prev = await db.select({ id: schema.historia.id }).from(schema.historia).where(eq(schema.historia.requestId, input.requestId));
  if (prev.length) return { ...(await currentItem(input.kod)), duplikat: true };

  let result: ActionResult;
  try {
    result = await db.transaction(async (tx) => {
      const [s] = await tx.select().from(schema.sprzet).where(eq(schema.sprzet.kod, input.kod)).for("update");
      const base = { kod: input.kod, akcja: label, kto: user.name, email: user.email, userOid: user.oid, uwagi, zrodlo, requestId: input.requestId };

      if (!s) {
        await tx.insert(schema.historia).values({ ...base, nazwa: "(nieznany kod)" });
        await enqueueAdmin({ ...T.mailNieznanyKod({ kod: input.kod, akcja: label, kto: user.name, email: user.email, uwagi }), rodzaj: "nieznany_kod", kod: input.kod }, tx);
        return { pozycja: null, nieznany: true };
      }

      const now = new Date();
      const innaOsoba = s.status !== "w_studiu" && !!s.email && s.email.toLowerCase() !== user.email;
      const reset = { miejsce: null, planowanyZwrot: null, oznaczyl: null };
      let ostrzezenie: string | undefined;
      let patch: Partial<typeof schema.sprzet.$inferInsert>;

      if (input.akcja === "biore") {
        patch = { status: "wypozyczony", ktoMa: user.name, email: user.email, userOid: user.oid, odKiedy: now, jest: false, przyp6h: null, przyp19Dzien: null, ...reset };
        if (innaOsoba) {
          ostrzezenie = `Ten sprzęt był zapisany na: ${s.ktoMa}${s.status === "poza_szkola" ? " (poza szkołą)" : ""}. Administrator dostanie informację.`;
          await enqueueAdmin({ ...T.mailPrzejecie({ kod: s.kod, nazwa: s.nazwa, poprzedni: s.ktoMa ?? "", poprzedniEmail: s.email, nowy: user.name, nowyEmail: user.email, od: s.odKiedy, uwagi }), rodzaj: "przejecie", kod: s.kod }, tx);
        }
      } else if (input.akcja === "oddaje") {
        patch = { status: "w_studiu", ktoMa: null, email: null, userOid: null, odKiedy: null, jest: true, sprawdzono: now, przyp6h: null, przyp19Dzien: null, ...reset };
        if (innaOsoba) {
          ostrzezenie = `Oddajesz sprzęt zapisany na: ${s.ktoMa}. Administrator dostanie informację.`;
          await enqueueAdmin({ ...T.mailOddanieCudzego({ kod: s.kod, nazwa: s.nazwa, wlasciciel: s.ktoMa ?? "", wlascicielEmail: s.email, oddajacy: user.name, oddajacyEmail: user.email, od: s.odKiedy, uwagi }), rodzaj: "oddanie_cudzego", kod: s.kod }, tx);
        }
      } else {
        patch = { jest: true, sprawdzono: now };
        if (s.status !== "w_studiu") {
          ostrzezenie = `Sprzęt figuruje jako ${s.status === "poza_szkola" ? "poza szkołą u" : "wypożyczony przez"}: ${s.ktoMa}. Status bez zmian.`;
          await enqueueAdmin({ ...T.mailSprawdzamWypozyczony({ kod: s.kod, nazwa: s.nazwa, ktoMa: s.ktoMa, email: s.email, od: s.odKiedy, sprawdzil: user.name, uwagi }), rodzaj: "sprawdzam_wypozyczony", kod: s.kod }, tx);
        }
      }

      if (input.akcja === "biore") {
        const r = await reservationNow(tx, s.kod, now);
        if (r && r.email !== user.email) {
          const msg = `Uwaga: zarezerwowane dla ${r.imie} do ${fmtTime(r.do)}.`;
          ostrzezenie = ostrzezenie ? `${ostrzezenie} ${msg}` : msg;
        }
      }

      const [updated] = await tx.update(schema.sprzet).set({ ...patch, zaktualizowano: now }).where(eq(schema.sprzet.id, s.id)).returning();
      await tx.insert(schema.historia).values({ ...base, nazwa: s.nazwa, kiedy: now });
      return { pozycja: view(updated), ostrzezenie };
    });
  } catch (e) {
    // Dwa identyczne kliknięcia w tej samej chwili: drugie trafia w UNIQUE(request_id).
    if (isUniqueViolation(e)) return { ...(await currentItem(input.kod)), duplikat: true };
    throw e;
  }

  if (input.akcja === "biore" && !result.nieznany) await detectAnomaly(user);
  return result;
}

async function currentItem(kod: number): Promise<ActionResult> {
  const [s] = await db.select().from(schema.sprzet).where(eq(schema.sprzet.kod, kod));
  return { pozycja: s ? view(s) : null, nieznany: !s };
}

/** Ponad 30 × Biorę w 10 minut z jednego konta → automatyczna blokada i mail do administratora. */
async function detectAnomaly(user: User) {
  if (await hit("anomalia_biore", user.oid)) return;
  const powod = "ponad 30 akcji Biorę w 10 minut";
  await db.transaction(async (tx) => {
    await tx.update(schema.uzytkownicy).set({ zablokowany: true, powodBlokady: powod }).where(eq(schema.uzytkownicy.oid, user.oid));
    await writeAudit({ userOid: user.oid, zdarzenie: "blokada_automatyczna", obiekt: user.email, szczegoly: { powod }, wynik: "odmowa" }, tx);
    await enqueueAdmin({ ...T.mailBlokada({ email: user.email, imie: user.name, powod }), rodzaj: "blokada" }, tx);
  });
}

// ---------- odczyty ----------
export type Filtr = "wszystko" | "brakuje" | "bezqr" | "wypozyczone";

export async function listEquipment(filtr: Filtr = "wszystko", q?: string) {
  const conds = [];
  if (filtr === "brakuje") conds.push(eq(schema.sprzet.jest, false));
  if (filtr === "bezqr") conds.push(eq(schema.sprzet.maQr, false));
  if (filtr === "wypozyczone") conds.push(ne(schema.sprzet.status, "w_studiu"));
  if (q?.trim()) {
    const term = `%${q.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    const asNum = Number(q.trim());
    conds.push(or(ilike(schema.sprzet.nazwa, term), ilike(schema.sprzet.kategoria, term), Number.isInteger(asNum) ? eq(schema.sprzet.kod, asNum) : undefined)!);
  }
  const order = filtr === "wypozyczone" ? [asc(schema.sprzet.odKiedy)] : [asc(schema.sprzet.kod)];
  const rows = await db.select().from(schema.sprzet).where(conds.length ? and(...conds) : undefined).orderBy(...order);
  const [c] = await db
    .select({
      wszystkie: sql<number>`count(*)::int`,
      sprawdzone: sql<number>`count(*) filter (where ${schema.sprzet.jest})::int`,
      poza: sql<number>`count(*) filter (where ${schema.sprzet.status} <> 'w_studiu')::int`,
      pozaSzkola: sql<number>`count(*) filter (where ${schema.sprzet.status} = 'poza_szkola')::int`,
      ponad24: sql<number>`count(*) filter (where ${schema.sprzet.status} = 'wypozyczony' and ${schema.sprzet.odKiedy} < now() - interval '24 hours')::int`,
    })
    .from(schema.sprzet);
  const rez = await upcomingByItem();
  return { lista: rows.map((r) => ({ ...view(r), rezerwacja: rez.get(r.kod) ?? null })), liczniki: c };
}

export async function getByKod(kod: number) {
  const [s] = await db.select().from(schema.sprzet).where(eq(schema.sprzet.kod, kod));
  return s ? view(s) : null;
}

export async function itemsOf(email: string, tx?: Tx) {
  const rows = await (tx ?? db)
    .select()
    .from(schema.sprzet)
    .where(and(eq(schema.sprzet.status, "wypozyczony"), eq(schema.sprzet.email, email.toLowerCase())))
    .orderBy(asc(schema.sprzet.odKiedy));
  return rows;
}

// ---------- inwentaryzacja ----------
export async function setJest(user: User, kod: number, jest: boolean) {
  const [s] = await db
    .update(schema.sprzet)
    .set({ jest, ...(jest ? { sprawdzono: new Date() } : {}), zaktualizowano: new Date() })
    .where(eq(schema.sprzet.kod, kod))
    .returning();
  if (!s) throw new HttpError(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
  return view(s);
}

export async function startInventory(user: User) {
  const rows = await db.update(schema.sprzet).set({ jest: false, zaktualizowano: new Date() }).where(eq(schema.sprzet.jest, true)).returning({ id: schema.sprzet.id });
  await writeAudit({ userOid: user.oid, zdarzenie: "inwentaryzacja_start", szczegoly: { zmienione: rows.length }, wynik: "ok" });
  return { zmienione: rows.length };
}

/** Maile o brakach: osoby z wypożyczonym sprzętem (jeden mail z tabelą) + podsumowanie dla administratora. */
export async function sendShortageReminders(user: User) {
  const braki = await db.select().from(schema.sprzet).where(eq(schema.sprzet.jest, false)).orderBy(asc(schema.sprzet.kod));
  if (!braki.length) return { braki: 0, osoby: 0 };


  // Sprzęt oznaczony „poza szkołą” to nie brak — administrator wie, gdzie jest; trafia tylko do podsumowania.
  const wyp = braki.filter((b) => b.status === "wypozyczony");
  const poza = braki.filter((b) => b.status === "poza_szkola");
  const zag = braki.filter((b) => b.status === "w_studiu");

  const byEmail = new Map<string, Sprzet[]>();
  for (const b of wyp) {
    if (!b.email) continue;
    const k = b.email.toLowerCase();
    byEmail.set(k, [...(byEmail.get(k) ?? []), b]);
  }

  const ostatnie = zag.length
    ? await db
        .selectDistinctOn([schema.historia.kod], { kod: schema.historia.kod, kiedy: schema.historia.kiedy, akcja: schema.historia.akcja, kto: schema.historia.kto })
        .from(schema.historia)
        .where(inArray(schema.historia.kod, zag.map((z) => z.kod)))
        .orderBy(schema.historia.kod, desc(schema.historia.kiedy))
    : [];
  const lastMap = new Map(ostatnie.map((o) => [o.kod, `${fmtDateTime(o.kiedy)} · ${o.akcja} · ${o.kto}`]));

  await db.transaction(async (tx) => {
    for (const [email, items] of byEmail) {
      await enqueueMail({ to: email, ...T.mailBrakiOsoba(items[0].ktoMa ?? email, items), rodzaj: "braki_osoba" }, tx);
    }
    await enqueueAdmin(
      { ...T.mailBrakiAdmin(wyp, zag.map((z) => ({ kod: z.kod, nazwa: z.nazwa, ostatni: lastMap.get(z.kod) ?? "brak wpisów" })), poza), rodzaj: "braki_admin" },
      tx,
    );
    await writeAudit({ userOid: user.oid, zdarzenie: "braki_maile", szczegoly: { braki: braki.length, osoby: byEmail.size }, wynik: "ok" }, tx);
  });
  return { braki: braki.length - poza.length, osoby: byEmail.size };
}

/** Przypomnij osobie: jeden mail z całym sprzętem zapisanym na ten adres. */
export async function remindPerson(user: User, email: string) {
  const items = await itemsOf(email);
  if (!items.length) return { pozycje: 0 };
  await db.transaction(async (tx) => {
    await enqueueMail({ to: email, ...T.mailPrzypomnijOsobie(items[0].ktoMa ?? email, items, user.name), rodzaj: "przypomnij", kod: items.length === 1 ? items[0].kod : null }, tx);
    await writeAudit({ userOid: user.oid, zdarzenie: "przypomnij_osobie", obiekt: email, szczegoly: { pozycje: items.length }, wynik: "ok" }, tx);
  });
  return { pozycje: items.length };
}

// ---------- poza szkołą ----------
async function reservationNow(tx: Tx, kod: number, now: Date) {
  const rows = await tx.execute<{ imie: string; email: string; do: Date }>(sql`
    select r.imie, r.email, r."do" from rezerwacje_sprzet rs join rezerwacje r on r.id = rs.rezerwacja_id
    where rs.kod = ${kod} and rs.zatwierdzona and rs.okres @> ${now.toISOString()}::timestamptz limit 1`);
  return rows[0] ? { ...rows[0], do: new Date(rows[0].do) } : null;
}

export type PozaInput = { email: string; miejsce: string; planowanyZwrot?: string | null; uwagi?: string | null };

/**
 * Administrator oznacza sprzęt jako „poza szkołą” (np. mikrofony w domu) — dla siebie albo dla innej osoby z listy.
 * Sprzęt nie jest wtedy w szkole: widać to wszędzie, nie dostaje przypomnień 6 h / 19:00 i nie jest brakiem w inwentaryzacji.
 * Powrót: zwykłe „Oddaję”.
 */
export async function markOutOfSchool(admin: User, kod: number, p: PozaInput) {
  const email = p.email.trim().toLowerCase();
  const [osoba] = await db.select().from(schema.uzytkownicy).where(eq(schema.uzytkownicy.email, email));
  if (!osoba || osoba.zablokowany || !osoba.zaakceptowany) throw new HttpError(400, "zla_osoba", "Wybierz aktywną osobę z listy użytkowników.");
  const uwagi = [p.miejsce, p.planowanyZwrot ? `zwrot do ${p.planowanyZwrot.split("-").reverse().join(".")}` : null, p.uwagi?.trim() || null].filter(Boolean).join(" · ").slice(0, 500);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(schema.sprzet).where(eq(schema.sprzet.kod, kod)).for("update");
    if (!s) throw new HttpError(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
    const now = new Date();
    const [u] = await tx
      .update(schema.sprzet)
      .set({
        status: "poza_szkola",
        ktoMa: osoba.imie || email,
        email,
        userOid: osoba.oid.startsWith("dodany:") ? null : osoba.oid,
        // zachowaj datę, jeśli ta sama osoba już go miała
        odKiedy: s.status !== "w_studiu" && s.email === email && s.odKiedy ? s.odKiedy : now,
        jest: false,
        miejsce: p.miejsce,
        planowanyZwrot: p.planowanyZwrot || null,
        oznaczyl: admin.email,
        przyp6h: null,
        przyp19Dzien: null,
        zaktualizowano: now,
      })
      .where(eq(schema.sprzet.id, s.id))
      .returning();
    await tx.insert(schema.historia).values({ kiedy: now, nazwa: s.nazwa, kod, akcja: "Poza szkołą", kto: osoba.imie || email, email, userOid: u.userOid, uwagi: `${uwagi} (oznaczył: ${admin.name})`.slice(0, 500), zrodlo: "panel", requestId: null });
    await writeAudit({ userOid: admin.oid, zdarzenie: "admin_poza_szkola", obiekt: String(kod), szczegoly: { email, miejsce: p.miejsce, planowanyZwrot: p.planowanyZwrot ?? null }, wynik: "ok" }, tx);
    return view(u);
  });
}
