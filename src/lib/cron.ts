import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Sprzet } from "@/db/schema";
import { enqueueAdmin, enqueueMail, processOutbox } from "./mail";
import * as T from "./templates";
import { claimOnce, getCisza } from "./settings";
import { hm, inQuiet, startOfWarsawDay, warsaw } from "./time";
import { config } from "./config";
import { expirePending } from "./reservations";

function groupByEmail(rows: Sprzet[]) {
  const m = new Map<string, Sprzet[]>();
  for (const r of rows) if (r.email) m.set(r.email.toLowerCase(), [...(m.get(r.email.toLowerCase()) ?? []), r]);
  return m;
}

/** Początek bieżącej (albo ostatniej) ciszy, np. dziś 21:00 albo wczoraj 21:00. */
export function quietStart(now: Date, od: string): Date {
  const back = (warsaw(now).minutes - hm(od) + 1440) % 1440;
  return new Date(now.getTime() - back * 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}

/**
 * Jeden tick co 15 minut. Serwer sam patrzy na godzinę w Europe/Warsaw.
 * Każde zadanie ma własną ochronę przed duplikatem, więc ponowiony tick niczego nie wyśle drugi raz.
 */
export async function tick(now = new Date()) {
  const w = warsaw(now);
  const cisza = await getCisza();
  const quiet = inQuiet(now, cisza.od, cisza.do);
  const done: string[] = [];

  // Raport pon–pt 15:30 (do końca dnia, gdyby tick o 15:30 się nie udał).
  if (w.weekday <= 5 && w.minutes >= hm("15:30") && !quiet && (await claimOnce("raport_ostatni", w.dateStr))) {
    await sendReport(now);
    done.push("raport");
  }

  if (!quiet) {
    // Przypomnienie 6 h po od_kiedy; jeśli wypadło w ciszy, poleci w pierwszym ticku po 7:00.
    const due = await db
      .select()
      .from(schema.sprzet)
      .where(and(eq(schema.sprzet.status, "wypozyczony"), isNull(schema.sprzet.przyp6h), lte(schema.sprzet.odKiedy, new Date(now.getTime() - 6 * 3_600_000))));
    if (due.length) {
      await db.transaction(async (tx) => {
        for (const [email, items] of groupByEmail(due)) {
          await enqueueMail({ to: email, ...T.mailPrzypomnienie6h(items[0].ktoMa ?? email, items), rodzaj: "przyp_6h", kod: items.length === 1 ? items[0].kod : null }, tx);
        }
        await tx.update(schema.sprzet).set({ przyp6h: now }).where(inArray(schema.sprzet.id, due.map((d) => d.id)));
      });
      done.push(`przyp_6h:${due.length}`);
    }

    // Przypomnienie wieczorne 19:00 dla osób, które dostały już przypomnienie 6 h.
    if (w.minutes >= hm("19:00")) {
      const evening = await db
        .select()
        .from(schema.sprzet)
        .where(
          and(
            eq(schema.sprzet.status, "wypozyczony"),
            isNotNull(schema.sprzet.przyp6h),
            lt(schema.sprzet.przyp6h, now),
            or(isNull(schema.sprzet.przyp19Dzien), lt(schema.sprzet.przyp19Dzien, w.dateStr)),
          ),
        );
      if (evening.length) {
        await db.transaction(async (tx) => {
          for (const [email, items] of groupByEmail(evening)) {
            await enqueueMail({ to: email, ...T.mailPrzypomnienie19(items[0].ktoMa ?? email, items), rodzaj: "przyp_19", kod: items.length === 1 ? items[0].kod : null }, tx);
          }
          await tx.update(schema.sprzet).set({ przyp19Dzien: w.dateStr }).where(inArray(schema.sprzet.id, evening.map((d) => d.id)));
        });
        done.push(`przyp_19:${evening.length}`);
      }
    }
  }

  // Auto check-out: od początku ciszy zamykamy wizyty otwarte przed jej startem.
  if (quiet) {
    const start = quietStart(now, cisza.od);
    const closed = await db
      .update(schema.obecnosci)
      .set({ wyjscie: now, zrodloWyjscia: "auto" })
      .where(and(isNull(schema.obecnosci.wyjscie), lt(schema.obecnosci.wejscie, start)))
      .returning();
    if (closed.length) {
      await db.transaction(async (tx) => {
        for (const o of closed) await enqueueMail({ to: o.email, ...T.mailAutoCheckout(o.imie, o.wejscie), rodzaj: "auto_checkout" }, tx);
      });
      done.push(`auto_checkout:${closed.length}`);
    }
  }

  // Retencja obecności: raz na dobę w nocy.
  if (quiet && (await claimOnce("retencja_ostatnia", w.dateStr))) {
    const r = await db.execute(sql`select anonimizuj_obecnosci(${config.retentionMonths}) as n`);
    done.push(`retencja:${(r[0] as { n: number }).n}`);
  }

  const wygasle = await expirePending(now);
  if (wygasle) done.push(`rezerwacje_wygasle:${wygasle}`);

  const mail = await processOutbox(50);
  return { czas: now.toISOString(), zadania: done, maile: mail };
}

async function sendReport(now: Date) {
  const w = warsaw(now);
  const wypozyczone = await db.select().from(schema.sprzet).where(eq(schema.sprzet.status, "wypozyczony")).orderBy(schema.sprzet.odKiedy);
  const poza = await db.select().from(schema.sprzet).where(eq(schema.sprzet.status, "poza_szkola")).orderBy(schema.sprzet.odKiedy);
  const rez = await db.execute<{ imie: string; od: Date; do: Date; sprzet: string }>(sql`
    select r.imie, r.od, r."do", string_agg(s.nazwa, ', ' order by s.kod) as sprzet
    from rezerwacje r join rezerwacje_sprzet rs on rs.rezerwacja_id = r.id join sprzet s on s.kod = rs.kod
    where r.status = 'zatwierdzona' and r.od < ${new Date(now.getTime() + 36 * 3_600_000).toISOString()}::timestamptz and r."do" > ${now.toISOString()}::timestamptz
    group by r.id order by r.od`);
  const oczekujace = await db.execute<{ n: number }>(sql`select count(*)::int as n from rezerwacje where status = 'oczekuje'`);
  const dayStart = startOfWarsawDay(now);
  const yStart = startOfWarsawDay(new Date(dayStart.getTime() - 12 * 3_600_000));
  const dzis = await db.select().from(schema.obecnosci).where(gte(schema.obecnosci.wejscie, dayStart)).orderBy(schema.obecnosci.wejscie);
  const auto = await db
    .select()
    .from(schema.obecnosci)
    .where(and(eq(schema.obecnosci.zrodloWyjscia, "auto"), gte(schema.obecnosci.wejscie, yStart), lt(schema.obecnosci.wejscie, dayStart)));
  await enqueueAdmin({
    ...T.mailRaport({
      wypozyczone,
      poza,
      rezerwacje: rez.map((r) => ({ ...r, od: new Date(r.od), do: new Date(r.do) })),
      oczekujace: oczekujace[0]?.n ?? 0,
      dzis: dzis.map((o) => ({ imie: o.imie, wejscie: o.wejscie, wyjscie: o.wyjscie })),
      auto: auto.map((o) => ({ imie: o.imie, wejscie: o.wejscie, wyjscie: o.wyjscie })),
      dataStr: `${String(w.day).padStart(2, "0")}.${String(w.month).padStart(2, "0")}.${w.year}`,
    }),
    rodzaj: "raport",
  });
}
