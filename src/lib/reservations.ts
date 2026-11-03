import "server-only";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { HttpError, type User } from "./errors";
import { enqueueAdmin, enqueueMail } from "./mail";
import { writeAudit } from "./audit";
import * as T from "./templates";

export type Stan = "wolny" | "zajety" | "oczekuje" | "poza_szkola" | "wypozyczony";

export type Dostepnosc = {
  kod: number;
  nazwa: string;
  kategoria: string;
  stan: Stan;
  /** czytelny opis dla administratora i osoby rezerwującej */
  opis: string | null;
  konflikty: { rezerwacjaId: number; imie: string; od: string; do: string; status: string }[];
};

const iso = (d: Date) => d.toISOString();
const MAX_DNI = 14;
const MAX_WYPRZEDZENIE_DNI = 120;
const MAX_OCZEKUJACYCH = 5;

type Row = {
  kod: number; nazwa: string; kategoria: string; status: string; kto_ma: string | null; email: string | null;
  planowany_zwrot: string | null; od_kiedy: Date | null;
  konflikty: { rezerwacjaId: number; imie: string; email: string; od: string; do: string; status: string; zatw: boolean }[] | null;
};

/**
 * Dostępność całego sprzętu w przedziale [od, do):
 *  - zajęty: zatwierdzona rezerwacja innej osoby nakłada się na ten czas,
 *  - poza szkołą: oznaczony przez administratora i bez zwrotu przed początkiem,
 *  - wypożyczony: ktoś ma go teraz (może oddać przed czasem — ostrzeżenie, nie blokada),
 *  - oczekuje: są inne wnioski na ten czas, jeszcze nierozpatrzone.
 */
export async function availability(od: Date, doo: Date, opts: { pomin?: number; dla?: string } = {}, tx?: Tx): Promise<Dostepnosc[]> {
  const rows = await (tx ?? db).execute<Row>(sql`
    select s.kod, s.nazwa, s.kategoria, s.status, s.kto_ma, s.email, s.planowany_zwrot::text, s.od_kiedy,
      (select json_agg(json_build_object('rezerwacjaId', r.id, 'imie', r.imie, 'email', r.email, 'od', r.od, 'do', r."do", 'status', r.status, 'zatw', rs.zatwierdzona) order by r.od)
         from rezerwacje_sprzet rs join rezerwacje r on r.id = rs.rezerwacja_id
        where rs.kod = s.kod and rs.okres && tstzrange(${iso(od)}::timestamptz, ${iso(doo)}::timestamptz, '[)')
          and r.status in ('oczekuje', 'zatwierdzona') and r.id <> ${opts.pomin ?? 0}) as konflikty
    from sprzet s order by s.kod`);
  const odDzien = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(od);
  return rows.map((r) => {
    const k = (r.konflikty ?? []).filter((c) => !opts.dla || c.email !== opts.dla);
    const zatw = k.filter((c) => c.zatw);
    let stan: Stan = "wolny";
    let opis: string | null = null;
    const hm = (s: string) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(s)).replace(",", "");
    if (zatw.length) {
      stan = "zajety";
      opis = zatw.map((c) => `${c.imie}, ${hm(c.od)}–${hm(c.do).slice(-5)}`).join("; ");
    } else if (r.status === "poza_szkola" && (!r.planowany_zwrot || r.planowany_zwrot > odDzien)) {
      stan = "poza_szkola";
      opis = `poza szkołą u ${r.kto_ma ?? "?"}${r.planowany_zwrot ? `, zwrot do ${r.planowany_zwrot.split("-").reverse().join(".")}` : ", bez terminu zwrotu"}`;
    } else if (r.status !== "w_studiu" && r.email !== opts.dla) {
      stan = "wypozyczony";
      opis = `teraz ma: ${r.kto_ma ?? "?"}`;
    } else if (k.length) {
      stan = "oczekuje";
      opis = `${k.length} inn${k.length === 1 ? "y wniosek" : "e wnioski"} na ten czas`;
    }
    return {
      kod: r.kod, nazwa: r.nazwa, kategoria: r.kategoria, stan, opis,
      konflikty: k.map((c) => ({ rezerwacjaId: c.rezerwacjaId, imie: c.imie, od: new Date(c.od).toISOString(), do: new Date(c.do).toISOString(), status: c.status })),
    };
  });
}

export function validateWindow(od: Date, doo: Date, now = new Date()) {
  if (isNaN(od.getTime()) || isNaN(doo.getTime())) throw new HttpError(400, "zla_data", "Niepoprawna data.");
  if (doo <= od) throw new HttpError(400, "zla_data", "Koniec musi być po początku.");
  if (od.getTime() < now.getTime() - 15 * 60_000) throw new HttpError(400, "przeszlosc", "Nie można rezerwować w przeszłości.");
  if (doo.getTime() - od.getTime() > MAX_DNI * 86_400_000) throw new HttpError(400, "za_dlugo", `Rezerwacja może trwać najwyżej ${MAX_DNI} dni.`);
  if (od.getTime() - now.getTime() > MAX_WYPRZEDZENIE_DNI * 86_400_000) throw new HttpError(400, "za_daleko", `Rezerwować można najwyżej ${MAX_WYPRZEDZENIE_DNI} dni naprzód.`);
}

export async function createRequest(user: User, p: { od: Date; do: Date; kody: number[]; cel?: string | null }) {
  validateWindow(p.od, p.do);
  const kody = [...new Set(p.kody)];
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from rezerwacje where user_oid = ${user.oid} and status = 'oczekuje'`);
    if (n >= MAX_OCZEKUJACYCH) throw new HttpError(429, "za_duzo", `Masz już ${n} wnioski czekające na decyzję.`);
    const dost = (await availability(p.od, p.do, { dla: user.email }, tx)).filter((d) => kody.includes(d.kod));
    if (dost.length !== kody.length) throw new HttpError(400, "nieznany_kod", "Część sprzętu nie istnieje.");
    const zajete = dost.filter((d) => d.stan === "zajety");
    if (zajete.length) throw new HttpError(409, "zajete", `Już zajęte w tym czasie: ${zajete.map((z) => z.nazwa).join(", ")}.`, { zajete: zajete.map((z) => z.kod) });

    const [r] = await tx.execute<{ id: number }>(sql`
      insert into rezerwacje (user_oid, email, imie, od, "do", cel)
      values (${user.oid}, ${user.email}, ${user.name}, ${iso(p.od)}::timestamptz, ${iso(p.do)}::timestamptz, ${p.cel?.trim() || null})
      returning id`);
    for (const kod of kody) {
      await tx.execute(sql`insert into rezerwacje_sprzet (rezerwacja_id, kod, okres) values (${r.id}, ${kod}, tstzrange(${iso(p.od)}::timestamptz, ${iso(p.do)}::timestamptz, '[)'))`);
    }
    await enqueueAdmin({ ...T.mailRezerwacjaNowa({ id: r.id, imie: user.name, email: user.email, od: p.od, do: p.do, cel: p.cel ?? null, pozycje: dost }), rodzaj: "rezerwacja_nowa" }, tx);
    await writeAudit({ userOid: user.oid, zdarzenie: "rezerwacja_wniosek", obiekt: String(r.id), szczegoly: { kody }, wynik: "ok" }, tx);
    return { id: r.id, pozycje: dost };
  });
}

type ResRow = {
  id: number; user_oid: string; email: string; imie: string; od: Date; do: Date; cel: string | null; status: string;
  decyzja_przez: string | null; decyzja_kiedy: Date | null; powod: string | null; utworzono: Date;
  pozycje: { kod: number; nazwa: string }[];
};

function resView(r: ResRow) {
  return {
    id: r.id, email: r.email, imie: r.imie, od: new Date(r.od).toISOString(), do: new Date(r.do).toISOString(), cel: r.cel, status: r.status,
    decyzjaPrzez: r.decyzja_przez, decyzjaKiedy: r.decyzja_kiedy ? new Date(r.decyzja_kiedy).toISOString() : null, powod: r.powod,
    utworzono: new Date(r.utworzono).toISOString(), pozycje: r.pozycje ?? [],
  };
}
export type RezerwacjaView = ReturnType<typeof resView>;

const SELECT = sql`
  select r.*, coalesce((select json_agg(json_build_object('kod', s.kod, 'nazwa', s.nazwa) order by s.kod)
    from rezerwacje_sprzet rs join sprzet s on s.kod = rs.kod where rs.rezerwacja_id = r.id), '[]') as pozycje
  from rezerwacje r`;

export async function myReservations(oid: string) {
  const rows = await db.execute<ResRow>(sql`${SELECT} where r.user_oid = ${oid} and (r."do" > now() - interval '30 days') order by r.od desc limit 50`);
  return rows.map(resView);
}

async function getLocked(tx: Tx, id: number) {
  const [r] = await tx.execute<ResRow>(sql`${SELECT} where r.id = ${id} for update of r`);
  if (!r) throw new HttpError(404, "nie_ma", "Nie ma takiej rezerwacji.");
  return r;
}

export async function cancelReservation(user: User, id: number) {
  return db.transaction(async (tx) => {
    const r = await getLocked(tx, id);
    if (r.user_oid !== user.oid && !user.admin) throw new HttpError(404, "nie_ma", "Nie ma takiej rezerwacji.");
    if (!["oczekuje", "zatwierdzona"].includes(r.status) || new Date(r.do) < new Date()) throw new HttpError(409, "nie_mozna", "Tej rezerwacji nie da się już anulować.");
    await tx.execute(sql`update rezerwacje set status = 'anulowana' where id = ${id}`);
    await tx.execute(sql`update rezerwacje_sprzet set zatwierdzona = false where rezerwacja_id = ${id}`);
    if (r.status === "zatwierdzona" && r.user_oid === user.oid) await enqueueAdmin({ ...T.mailRezerwacjaAnulowana(resView(r)), rodzaj: "rezerwacja_anulowana" }, tx);
    await writeAudit({ userOid: user.oid, zdarzenie: "rezerwacja_anulowana", obiekt: String(id), wynik: "ok" }, tx);
    return { ok: true };
  });
}

const isExclusion = (e: unknown) => {
  const c = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return c === "23P01";
};

/** Decyzja administratora. Zatwierdzenie pilnuje baza: dwie zatwierdzone rezerwacje tego samego sprzętu nie mogą się nakładać. */
export async function decide(admin: User, id: number, decyzja: "zatwierdz" | "odrzuc", powod?: string | null) {
  try {
    return await db.transaction(async (tx) => {
      const r = await getLocked(tx, id);
      if (r.status !== "oczekuje") throw new HttpError(409, "rozpatrzona", "Ta rezerwacja została już rozpatrzona.");
      if (decyzja === "zatwierdz" && new Date(r.do) < new Date()) throw new HttpError(409, "minela", "Termin tej rezerwacji już minął.");
      const status = decyzja === "zatwierdz" ? "zatwierdzona" : "odrzucona";
      await tx.execute(sql`update rezerwacje set status = ${status}, decyzja_przez = ${admin.email}, decyzja_kiedy = now(), powod = ${powod?.trim() || null} where id = ${id}`);
      if (decyzja === "zatwierdz") await tx.execute(sql`update rezerwacje_sprzet set zatwierdzona = true where rezerwacja_id = ${id}`);
      const v = { ...resView(r), status, powod: powod?.trim() || null };
      await enqueueMail({ to: r.email, ...T.mailRezerwacjaDecyzja(v), rodzaj: "rezerwacja_decyzja" }, tx);
      await writeAudit({ userOid: admin.oid, zdarzenie: `rezerwacja_${status}`, obiekt: String(id), szczegoly: { powod: powod ?? null }, wynik: "ok" }, tx);
      return v;
    });
  } catch (e) {
    if (isExclusion(e)) {
      const [r] = await db.execute<ResRow>(sql`${SELECT} where r.id = ${id}`);
      const zaj = (await availability(new Date(r.od), new Date(r.do), { pomin: id })).filter((d) => d.stan === "zajety" && r.pozycje.some((p) => p.kod === d.kod));
      throw new HttpError(409, "konflikt", `Nie można zatwierdzić — w tym czasie zajęte: ${zaj.map((z) => `${z.nazwa} (${z.opis})`).join("; ")}.`);
    }
    throw e;
  }
}

/** Panel: wnioski z dostępnością każdej pozycji, nadchodzące zatwierdzone, ostatnio rozpatrzone. */
export async function adminList() {
  const oczekujace = (await db.execute<ResRow>(sql`${SELECT} where r.status = 'oczekuje' order by r.od`)).map(resView);
  const withAvail = [];
  for (const r of oczekujace) {
    const dost = await availability(new Date(r.od), new Date(r.do), { pomin: r.id, dla: r.email });
    withAvail.push({ ...r, dostepnosc: dost.filter((d) => r.pozycje.some((p) => p.kod === d.kod)) });
  }
  const nadchodzace = (await db.execute<ResRow>(sql`${SELECT} where r.status = 'zatwierdzona' and r."do" > now() order by r.od limit 100`)).map(resView);
  const ostatnie = (await db.execute<ResRow>(sql`${SELECT} where r.status not in ('oczekuje') and (r.status <> 'zatwierdzona' or r."do" <= now()) order by coalesce(r.decyzja_kiedy, r.utworzono) desc limit 30`)).map(resView);
  return { oczekujace: withAvail, nadchodzace, ostatnie };
}

/** Najbliższe zatwierdzone rezerwacje (trwające albo w ciągu 24 h) — do pokazania przy sprzęcie. */
export async function upcomingByItem(now = new Date()) {
  const rows = await db.execute<{ kod: number; imie: string; email: string; od: Date; do: Date }>(sql`
    select distinct on (rs.kod) rs.kod, r.imie, r.email, r.od, r."do"
    from rezerwacje_sprzet rs join rezerwacje r on r.id = rs.rezerwacja_id
    where rs.zatwierdzona and r."do" > ${iso(now)}::timestamptz and r.od < ${iso(new Date(now.getTime() + 24 * 3_600_000))}::timestamptz
    order by rs.kod, r.od`);
  return new Map(rows.map((r) => [r.kod, { imie: r.imie, email: r.email, od: new Date(r.od).toISOString(), do: new Date(r.do).toISOString() }]));
}

/** Tick: wnioski, których początek minął bez decyzji, wygasają (z mailem do osoby). */
export async function expirePending(now = new Date()) {
  const rows = await db.execute<ResRow>(sql`${SELECT} where r.status = 'oczekuje' and r.od < ${iso(now)}::timestamptz`);
  if (!rows.length) return 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx.execute(sql`update rezerwacje set status = 'wygasla' where id = ${r.id} and status = 'oczekuje'`);
      await enqueueMail({ to: r.email, ...T.mailRezerwacjaDecyzja({ ...resView(r), status: "wygasla", powod: null }), rodzaj: "rezerwacja_wygasla" }, tx);
    }
  });
  return rows.length;
}
