/**
 * Import list SharePoint „Sprzęt” i „Historia” (eksport do CSV z SharePointa) do PostgreSQL.
 *
 *   DATABASE_URL_ADMIN=... npm run import:sharepoint -- --sprzet Sprzet.csv --historia Historia.csv          (podgląd)
 *   DATABASE_URL_ADMIN=... npm run import:sharepoint -- --sprzet Sprzet.csv --historia Historia.csv --zapisz (zapis)
 *
 * Sprawdza liczbę wierszy i unikalność Kodu. Daty bez strefy traktuje jako czas warszawski.
 * Kolumny rozpoznaje po nazwie (wielkość liter, polskie znaki i spacje bez znaczenia).
 * Ponowne uruchomienie: Sprzęt jest aktualizowany po kodzie, Historia dopisywana tylko gdy tabela jest pusta
 * albo z flagą --historia-od <YYYY-MM-DD> (końcowy import przy przełączeniu).
 */
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import postgres from "postgres";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const write = args.includes("--zapisz");
const fSprzet = arg("--sprzet");
const fHist = arg("--historia");
const histOd = arg("--historia-od");
if (!fSprzet && !fHist) {
  console.error("Podaj --sprzet <plik.csv> i/lub --historia <plik.csv>");
  process.exit(1);
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "l").toLowerCase().replace(/[^a-z0-9]/g, "");

function readCsv(file: string): Record<string, string>[] {
  let text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = parse(text, { columns: (h: string[]) => h.map(norm), delimiter, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  return rows;
}

const pick = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const v = r[norm(n)];
    if (v !== undefined && v !== "") return v;
  }
  return "";
};

/** "30.10.2026 14:05", "2026-10-30 14:05", "2026-10-30T13:05:00Z", "10/30/2026 2:05 PM" */
function parseDate(s: string): Date | null {
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s) && !isNaN(Date.parse(s))) return new Date(s);
  let y: number, mo: number, d: number, h = 0, mi = 0;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) [d, mo, y, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/))) [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?: ?(AM|PM))?)?/i))) {
    [mo, d, y, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
    if (m[6]?.toUpperCase() === "PM" && h < 12) h += 12;
    if (m[6]?.toUpperCase() === "AM" && h === 12) h = 0;
  } else return null;
  // czas warszawski → UTC (sprawdź oba możliwe przesunięcia)
  for (const off of [1, 2]) {
    const g = new Date(Date.UTC(y, mo - 1, d, h - off, mi));
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(g);
    if (parts === `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`) return g;
  }
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi));
}

const truthy = (s: string) => /^(tak|yes|true|1|prawda)$/i.test(s.trim());
const kodOf = (s: string) => {
  const t = s.trim().split(/[.,]/)[0];
  return /^\d+$/.test(t) ? Number(t) : null;
};

const problems: string[] = [];

// ---------- Sprzęt ----------
type S = { kod: number; nazwa: string; kategoria: string; maQr: boolean; status: string; ktoMa: string | null; email: string | null; odKiedy: Date | null; jest: boolean; sprawdzono: Date | null; przyp6h: Date | null };
const sprzet: S[] = [];
if (fSprzet) {
  const rows = readCsv(fSprzet);
  const seen = new Set<number>();
  for (const [i, r] of rows.entries()) {
    const kod = kodOf(pick(r, "Kod"));
    if (!kod) {
      problems.push(`Sprzęt, wiersz ${i + 2}: brak poprawnego Kodu`);
      continue;
    }
    if (seen.has(kod)) problems.push(`Sprzęt: Kod ${kod} powtarza się`);
    seen.add(kod);
    const statusRaw = norm(pick(r, "Status"));
    const status = statusRaw.startsWith("wypo") ? "wypozyczony" : "w_studiu";
    const email = pick(r, "Email", "E-mail", "Mail").toLowerCase() || null;
    sprzet.push({
      kod,
      nazwa: pick(r, "Nazwa", "Title", "Tytuł"),
      kategoria: pick(r, "Kategoria"),
      maQr: pick(r, "QR", "MaQR") ? truthy(pick(r, "QR", "MaQR")) : kod < 101,
      status,
      ktoMa: status === "wypozyczony" ? pick(r, "KtoMa", "Kto ma", "Kto") || email : null,
      email: status === "wypozyczony" ? email : null,
      odKiedy: status === "wypozyczony" ? parseDate(pick(r, "OdKiedy", "Od kiedy")) : null,
      jest: pick(r, "Jest") ? truthy(pick(r, "Jest")) : status !== "wypozyczony",
      sprawdzono: parseDate(pick(r, "Sprawdzono")),
      przyp6h: parseDate(pick(r, "Przyp6h", "Przypomnienie6h", "Przyp 6h")),
    });
    if (!sprzet.at(-1)!.nazwa) problems.push(`Sprzęt: Kod ${kod} bez nazwy`);
  }
  console.log(`Sprzęt: ${rows.length} wierszy w CSV, ${sprzet.length} do importu, ${sprzet.filter((s) => s.status === "wypozyczony").length} wypożyczonych, ${sprzet.filter((s) => s.maQr).length} z QR`);
}

// ---------- Historia ----------
type H = { kiedy: Date; nazwa: string; kod: number | null; akcja: string; kto: string; email: string; uwagi: string | null };
const historia: H[] = [];
if (fHist) {
  const rows = readCsv(fHist);
  for (const [i, r] of rows.entries()) {
    const kiedy = parseDate(pick(r, "Kiedy", "Data", "Created", "Utworzono"));
    if (!kiedy) {
      problems.push(`Historia, wiersz ${i + 2}: brak daty`);
      continue;
    }
    if (histOd && kiedy < new Date(histOd)) continue;
    historia.push({
      kiedy,
      nazwa: pick(r, "Nazwa", "Title", "Tytuł") || "(bez nazwy)",
      kod: kodOf(pick(r, "Kod")),
      akcja: pick(r, "Akcja") || "?",
      kto: pick(r, "Kto", "KtoMa", "Osoba") || pick(r, "Email"),
      email: pick(r, "Email", "E-mail", "Mail").toLowerCase(),
      uwagi: pick(r, "Uwagi").slice(0, 500) || null,
    });
  }
  console.log(`Historia: ${rows.length} wierszy w CSV, ${historia.length} do importu`);
}

if (problems.length) {
  console.log(`\nUwagi (${problems.length}):\n - ` + problems.slice(0, 50).join("\n - "));
}
if (sprzet.length && new Set(sprzet.map((s) => s.kod)).size !== sprzet.length) {
  console.error("\nKody nie są unikalne — popraw CSV przed importem.");
  process.exit(1);
}
if (!write) {
  console.log("\nTo był podgląd. Dodaj --zapisz, żeby zapisać do bazy.");
  process.exit(0);
}

const url = process.env.DATABASE_URL_ADMIN;
if (!url) {
  console.error("Brak DATABASE_URL_ADMIN");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.begin(async (tx) => {
  for (const s of sprzet) {
    await tx`
      insert into sprzet (kod, nazwa, kategoria, ma_qr, status, kto_ma, email, od_kiedy, jest, sprawdzono, przyp_6h)
      values (${s.kod}, ${s.nazwa}, ${s.kategoria}, ${s.maQr}, ${s.status}, ${s.ktoMa}, ${s.email}, ${s.odKiedy}, ${s.jest}, ${s.sprawdzono}, ${s.przyp6h})
      on conflict (kod) do update set nazwa = excluded.nazwa, kategoria = excluded.kategoria, ma_qr = excluded.ma_qr, status = excluded.status,
        kto_ma = excluded.kto_ma, email = excluded.email, od_kiedy = excluded.od_kiedy, jest = excluded.jest, sprawdzono = excluded.sprawdzono,
        przyp_6h = excluded.przyp_6h, zaktualizowano = now()`;
  }
  if (historia.length) {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from historia where zrodlo = 'sharepoint'`;
    if (n > 0 && !histOd) throw new Error(`W bazie jest już ${n} wpisów z SharePointa. Do końcowego importu użyj --historia-od <data>.`);
    for (let i = 0; i < historia.length; i += 500) {
      const chunk = historia.slice(i, i + 500).map((h) => ({ ...h, zrodlo: "sharepoint" }));
      await tx`insert into historia ${tx(chunk, "kiedy", "nazwa", "kod", "akcja", "kto", "email", "uwagi", "zrodlo")}`;
    }
  }
  const [{ s }] = await tx<{ s: number }[]>`select count(*)::int as s from sprzet`;
  console.log(`\nZapisano. Sprzęt w bazie: ${s}.`);
});
await sql.end();
