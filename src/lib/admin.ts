import "server-only";
import { and, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { view } from "./equipment";
import { visitView } from "./attendance";
import { startOfWarsawDay } from "./time";

export async function dashboard() {
  const [k] = await db.execute<{
    wszystkie: number; poza: number; ponad24: number; sprawdzone: number;
    w_studiu_teraz: number; biore_dzis: number; oddaje_dzis: number; auto_wczoraj: number;
    poza_szkola: number; osoby_oczekuja: number; rezerwacje_oczekuja: number; rezerwacje_dzis: number;
  }>(sql`
    select
      (select count(*)::int from sprzet) as wszystkie,
      (select count(*)::int from sprzet where status <> 'w_studiu') as poza,
      (select count(*)::int from sprzet where status = 'poza_szkola') as poza_szkola,
      (select count(*)::int from uzytkownicy where not zaakceptowany and not zablokowany) as osoby_oczekuja,
      (select count(*)::int from rezerwacje where status = 'oczekuje') as rezerwacje_oczekuja,
      (select count(*)::int from rezerwacje where status = 'zatwierdzona' and "do" > now() and od < now() + interval '24 hours') as rezerwacje_dzis,
      (select count(*)::int from sprzet where status = 'wypozyczony' and od_kiedy < now() - interval '24 hours') as ponad24,
      (select count(*)::int from sprzet where jest) as sprawdzone,
      (select count(*)::int from obecnosci where wyjscie is null) as w_studiu_teraz,
      (select count(*)::int from historia where akcja = 'Biorę' and kiedy >= ${startOfWarsawDay().toISOString()}::timestamptz) as biore_dzis,
      (select count(*)::int from historia where akcja = 'Oddaję' and kiedy >= ${startOfWarsawDay().toISOString()}::timestamptz) as oddaje_dzis,
      (select count(*)::int from obecnosci where zrodlo_wyjscia = 'auto' and wyjscie >= now() - interval '24 hours') as auto_wczoraj
  `);

  const ponad24 = await db
    .select()
    .from(schema.sprzet)
    .where(and(eq(schema.sprzet.status, "wypozyczony"), lt(schema.sprzet.odKiedy, sql`now() - interval '24 hours'`)))
    .orderBy(schema.sprzet.odKiedy);

  // Zdarzenia z ostatnich 7 dni, które wymagają reakcji (z kolejki maili administracyjnych).
  const alerty = await db
    .select({ id: schema.mailOutbox.id, rodzaj: schema.mailOutbox.rodzaj, temat: schema.mailOutbox.temat, kod: schema.mailOutbox.kod, kiedy: schema.mailOutbox.utworzono })
    .from(schema.mailOutbox)
    .where(
      and(
        sql`${schema.mailOutbox.rodzaj} in ('nieznany_kod','przejecie','oddanie_cudzego','blokada')`,
        gte(schema.mailOutbox.utworzono, sql`now() - interval '7 days'`),
      ),
    )
    .orderBy(desc(schema.mailOutbox.utworzono))
    .limit(30);
  // jeden alert na zdarzenie, nie na adresata
  const seen = new Set<string>();
  const uwaga = alerty.filter((a) => {
    const key = `${a.rodzaj}|${a.temat}|${a.kiedy.toISOString().slice(0, 16)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const zablokowani = await db.select().from(schema.uzytkownicy).where(eq(schema.uzytkownicy.zablokowany, true));
  const oczekujaOsoby = await db
    .select()
    .from(schema.uzytkownicy)
    .where(and(eq(schema.uzytkownicy.zaakceptowany, false), eq(schema.uzytkownicy.zablokowany, false)));
  // Poza szkołą po planowanym terminie zwrotu.
  const pozaPoTerminie = await db
    .select()
    .from(schema.sprzet)
    .where(and(eq(schema.sprzet.status, "poza_szkola"), sql`${schema.sprzet.planowanyZwrot} < (now() at time zone 'Europe/Warsaw')::date`));

  const teraz = await db.select().from(schema.obecnosci).where(isNull(schema.obecnosci.wyjscie)).orderBy(schema.obecnosci.wejscie);
  const wypozyczoneWszystkie = await db.select().from(schema.sprzet).where(eq(schema.sprzet.status, "wypozyczony"));

  const aktywnosc = await db.execute<{ dzien: string; biore: number; oddaje: number }>(sql`
    with dni as (
      select generate_series((now() at time zone 'Europe/Warsaw')::date - 13, (now() at time zone 'Europe/Warsaw')::date, '1 day')::date as dzien
    )
    select to_char(d.dzien, 'YYYY-MM-DD') as dzien,
      count(h.*) filter (where h.akcja = 'Biorę')::int as biore,
      count(h.*) filter (where h.akcja = 'Oddaję')::int as oddaje
    from dni d
    left join historia h on (h.kiedy at time zone 'Europe/Warsaw')::date = d.dzien
    group by d.dzien order by d.dzien`);

  const top = await db.execute<{ kod: number; nazwa: string; ile: number }>(sql`
    select kod, max(nazwa) as nazwa, count(*)::int as ile from historia
    where akcja = 'Biorę' and kiedy >= now() - interval '30 days' and kod is not null
    group by kod order by ile desc, kod limit 5`);

  const ostatnie = await timeline({ strona: 1, naStrone: 5 });

  return {
    kafelki: k,
    uwaga: {
      ponad24: ponad24.map(view),
      zdarzenia: uwaga.map((a) => ({ ...a, kiedy: a.kiedy.toISOString() })),
      zablokowani: zablokowani.filter((u) => u.zaakceptowany).map((u) => ({ oid: u.oid, email: u.email, imie: u.imie, powod: u.powodBlokady })),
      oczekujaOsoby: oczekujaOsoby.map((u) => ({ oid: u.oid, email: u.email, imie: u.imie })),
      pozaPoTerminie: pozaPoTerminie.map(view),
    },
    teraz: teraz.map((o) => ({
      ...visitView(o),
      przySobie: wypozyczoneWszystkie.filter((s) => s.email === o.email).map((s) => ({ kod: s.kod, nazwa: s.nazwa })),
    })),
    aktywnosc: [...aktywnosc],
    top: [...top],
    ostatnie: ostatnie.wpisy,
  };
}

// ---------- połączona historia (sprzęt + wizyty) ----------
export type HistFilter = {
  od?: string; // YYYY-MM-DD
  do?: string;
  osoba?: string;
  kod?: string;
  typ?: string; // biore | oddaje | sprawdzam | wizyta | nieznany
  uwagi?: boolean;
  strona?: number;
  naStrone?: number;
};

export type HistRow = {
  rodzaj: "sprzet" | "wizyta";
  id: number;
  kiedy: string;
  akcja: string;
  kod: number | null;
  nazwa: string;
  kto: string;
  email: string;
  uwagi: string | null;
  zrodlo: string | null;
};

function dateBound(d: string | undefined, end = false): Date | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const base = startOfWarsawDay(new Date(`${d}T12:00:00Z`));
  return end ? startOfWarsawDay(new Date(base.getTime() + 36 * 3_600_000)) : base;
}

export async function timeline(f: HistFilter) {
  const per = Math.min(Math.max(f.naStrone ?? 50, 1), 500);
  const page = Math.max(f.strona ?? 1, 1);
  const od = dateBound(f.od);
  const doo = dateBound(f.do, true);
  const osoba = f.osoba?.trim() ? `%${f.osoba.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%` : null;
  const kodNum = f.kod?.trim() && /^\d+$/.test(f.kod.trim()) ? Number(f.kod.trim()) : null;
  const kodTxt = f.kod?.trim() && kodNum === null ? `%${f.kod.trim().replace(/[%_\\]/g, (c) => "\\" + c)}%` : null;
  const typ = f.typ ?? "";

  const wantSprzet = typ !== "wizyta";
  const wantWizyty = (typ === "" || typ === "wizyta") && !kodNum && !kodTxt && !f.uwagi;

  const h = schema.historia;
  const hc: SQL[] = [];
  if (od) hc.push(gte(h.kiedy, od));
  if (doo) hc.push(lt(h.kiedy, doo));
  if (osoba) hc.push(or(ilike(h.kto, osoba), ilike(h.email, osoba))!);
  if (kodNum !== null) hc.push(eq(h.kod, kodNum));
  if (kodTxt) hc.push(ilike(h.nazwa, kodTxt));
  if (typ === "biore") hc.push(eq(h.akcja, "Biorę"));
  if (typ === "oddaje") hc.push(eq(h.akcja, "Oddaję"));
  if (typ === "sprawdzam") hc.push(eq(h.akcja, "Sprawdzam"));
  if (typ === "nieznany") hc.push(eq(h.nazwa, "(nieznany kod)"));
  if (f.uwagi) hc.push(sql`coalesce(${h.uwagi}, '') <> ''`);

  // Wizyty rozbijamy na dwa zdarzenia: Check-in i Check-out.
  const wc: SQL[] = [];
  if (osoba) wc.push(sql`(imie ilike ${osoba} or email ilike ${osoba})`);

  const parts: SQL[] = [];
  if (wantSprzet) {
    parts.push(sql`select 'sprzet' as rodzaj, id, kiedy, akcja, kod, nazwa, kto, email, uwagi, zrodlo from historia ${hc.length ? sql`where ${and(...hc)}` : sql``}`);
  }
  if (wantWizyty) {
    const rng = (col: SQL) =>
      sql.join([od ? sql`${col} >= ${od.toISOString()}::timestamptz` : sql`true`, doo ? sql`${col} < ${doo.toISOString()}::timestamptz` : sql`true`, ...wc], sql` and `);
    parts.push(sql`select 'wizyta', id, wejscie, 'Check-in', null::int, 'Studio', imie, email, null, zrodlo_wejscia from obecnosci where ${rng(sql`wejscie`)}`);
    parts.push(sql`select 'wizyta', id, wyjscie, case when zrodlo_wyjscia = 'auto' then 'Check-out (auto)' when zrodlo_wyjscia = 'admin' then 'Check-out (admin)' else 'Check-out' end, null::int, 'Studio', imie, email, null, zrodlo_wyjscia from obecnosci where wyjscie is not null and ${rng(sql`wyjscie`)}`);
  }
  if (!parts.length) return { wpisy: [] as HistRow[], razem: 0, strona: page, naStrone: per };

  const union = sql.join(parts, sql` union all `);
  const rows = await db.execute<HistRow & { kiedy: Date; razem: number }>(sql`
    select *, count(*) over()::int as razem from (${union}) t
    order by kiedy desc, id desc
    limit ${per} offset ${(page - 1) * per}`);
  return {
    wpisy: rows.map((r) => ({ ...r, kiedy: new Date(r.kiedy).toISOString(), razem: undefined })) as HistRow[],
    razem: rows[0]?.razem ?? 0,
    strona: page,
    naStrone: per,
  };
}

export async function equipmentTimeline(kod: number) {
  const [s] = await db.select().from(schema.sprzet).where(eq(schema.sprzet.kod, kod));
  const hist = await db.select().from(schema.historia).where(eq(schema.historia.kod, kod)).orderBy(desc(schema.historia.kiedy)).limit(200);
  const maile = await db
    .select()
    .from(schema.mailOutbox)
    .where(and(eq(schema.mailOutbox.kod, kod), sql`${schema.mailOutbox.rodzaj} in ('przyp_6h','przyp_19','przypomnij')`))
    .orderBy(desc(schema.mailOutbox.utworzono))
    .limit(100);
  const NAZWY: Record<string, string> = { przyp_6h: "Przypomnienie 6 h", przyp_19: "Przypomnienie 19:00", przypomnij: "Przypomnienie ręczne" };
  const os = [
    ...hist.map((x) => ({ kiedy: x.kiedy.toISOString(), typ: x.akcja, kto: x.kto, uwagi: x.uwagi })),
    ...maile.map((m) => ({ kiedy: m.utworzono.toISOString(), typ: `${NAZWY[m.rodzaj] ?? m.rodzaj} ${m.status === "wyslany" ? "wysłane" : m.status === "blad" ? "— błąd wysyłki" : "w kolejce"}`, kto: m.do, uwagi: null })),
  ].sort((a, b) => b.kiedy.localeCompare(a.kiedy));
  return { pozycja: s ? view(s) : null, os };
}

export async function attendanceReport(od?: string, doo?: string) {
  const a = dateBound(od) ?? new Date(Date.now() - 30 * 86_400_000);
  const b = dateBound(doo, true) ?? new Date(Date.now() + 86_400_000);
  const wizyty = await db
    .select()
    .from(schema.obecnosci)
    .where(and(gte(schema.obecnosci.wejscie, a), lt(schema.obecnosci.wejscie, b)))
    .orderBy(desc(schema.obecnosci.wejscie))
    .limit(5000);
  const map = new Map<string, { email: string; imie: string; wizyty: number; minuty: number; auto: number }>();
  for (const w of wizyty) {
    const end = w.wyjscie ?? new Date();
    const m = map.get(w.email) ?? { email: w.email, imie: w.imie, wizyty: 0, minuty: 0, auto: 0 };
    m.wizyty++;
    m.minuty += Math.max(0, Math.round((end.getTime() - w.wejscie.getTime()) / 60000));
    if (w.zrodloWyjscia === "auto") m.auto++;
    map.set(w.email, m);
  }
  return {
    osoby: [...map.values()].sort((x, y) => y.minuty - x.minuty),
    wizyty: wizyty.map(visitView),
  };
}

export async function auditLog(od?: string, doo?: string, strona = 1) {
  const a = dateBound(od) ?? new Date(Date.now() - 30 * 86_400_000);
  const b = dateBound(doo, true) ?? new Date(Date.now() + 86_400_000);
  const rows = await db
    .select({
      id: schema.audyt.id,
      kiedy: schema.audyt.kiedy,
      zdarzenie: schema.audyt.zdarzenie,
      obiekt: schema.audyt.obiekt,
      szczegoly: schema.audyt.szczegoly,
      wynik: schema.audyt.wynik,
      email: schema.uzytkownicy.email,
    })
    .from(schema.audyt)
    .leftJoin(schema.uzytkownicy, eq(schema.uzytkownicy.oid, schema.audyt.userOid))
    .where(and(gte(schema.audyt.kiedy, a), lt(schema.audyt.kiedy, b)))
    .orderBy(desc(schema.audyt.kiedy))
    .limit(100)
    .offset((Math.max(strona, 1) - 1) * 100);
  return rows.map((r) => ({ ...r, kiedy: r.kiedy.toISOString() }));
}

export { toCsv, csvResponse } from "./csv";
