/**
 * Atrapa całego API na potrzeby statycznego dema (GitHub Pages).
 * Zamiast serwera, bazy i logowania Microsoft: stan w pamięci przeglądarki (z zapisem w localStorage),
 * te same kształty odpowiedzi, które zwracają prawdziwe endpointy /api/*.
 * Trafia do `.demo/src/lib/` podczas `npm run build:demo` — aplikacja produkcyjna go nie używa.
 */
import { ApiError } from "@/lib/client";

type Status = "w_studiu" | "wypozyczony" | "poza_szkola";
type Item = {
  kod: number; nazwa: string; kategoria: string; maQr: boolean; status: Status; ktoMa: string | null; email: string | null;
  odKiedy: string | null; jest: boolean; sprawdzono: string | null; miejsce: string | null; planowanyZwrot: string | null;
};
type Hist = { id: number; rodzaj: "sprzet" | "wizyta"; kiedy: string; akcja: string; kod: number | null; nazwa: string; kto: string; email: string; uwagi: string | null; zrodlo: string | null };
type Visit = { id: number; imie: string; email: string; wejscie: string; wyjscie: string | null; auto: boolean; zamknietaPrzez: string | null; sprzetPrzyWyjsciu: number[] };
type Rez = { id: number; imie: string; email: string; od: string; do: string; cel: string | null; status: string; powod: string | null; decyzjaPrzez: string | null; utworzono: string; kody: number[] };
type User = {
  oid: string; email: string; imie: string; rola: "admin" | "uzytkownik"; status: "aktywny" | "oczekuje" | "zablokowany"; powod: string | null;
  dodanyRecznie: boolean; adminZKonfiguracji: boolean; dodal: string | null; zaakceptowal: string | null; pierwsze: string; ostatnie: string | null;
};
type Audit = { id: number; kiedy: string; zdarzenie: string; obiekt: string | null; szczegoly: Record<string, unknown> | null; wynik: "ok" | "odmowa" | "limit"; email: string | null };
type Event = { id: number; rodzaj: string; temat: string; kod: number | null; kiedy: string };
type State = {
  v: number; rola: "admin" | "uzytkownik"; items: Item[]; hist: Hist[]; visits: Visit[]; rez: Rez[]; users: User[]; audit: Audit[]; events: Event[];
  settings: { cisza: { od: string; do: string }; inwentaryzacjaTylkoAdmin: boolean; checkinWCiszy: "odrzucaj" | "pozwalaj" };
  doorVersion: number; nextId: number; seen: string[];
};

const KEY = "studio-wideo-demo-v1";
const H = 3_600_000;
const D = 24 * H;
export const DEMO_ME = { email: "demo@example.pl", imie: "Demo Użytkownik" };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const dayStr = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date(Date.now() + ms));
const hm = (iso: string) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// ---------- dane początkowe ----------
const PEOPLE = [
  { email: "anna.kowalska@example.pl", imie: "Anna Kowalska" },
  { email: "piotr.nowak@example.pl", imie: "Piotr Nowak" },
  { email: "marta.wisniewska@example.pl", imie: "Marta Wiśniewska" },
  { email: "jan.zielinski@example.pl", imie: "Jan Zieliński" },
];

const CATALOG: [number, string, string, boolean][] = [
  [1, "Kamera Sony FX3", "Kamery", true], [2, "Kamera Sony A7 IV", "Kamery", true], [3, "Kamera Blackmagic Pocket 6K", "Kamery", true],
  [4, "Obiektyw 24-70 mm f/2.8", "Obiektywy", true], [5, "Obiektyw 50 mm f/1.2", "Obiektywy", true], [6, "Obiektyw 16-35 mm f/4", "Obiektywy", true],
  [7, "Mikrofon Rode NTG5", "Dźwięk", true], [8, "Mikrofon Sennheiser MKH 416", "Dźwięk", true], [9, "Mikrofon krawatowy DJI Mic 2", "Dźwięk", true],
  [10, "Rejestrator Zoom F6", "Dźwięk", true], [11, "Statyw Manfrotto 504X", "Statywy", true], [12, "Statyw Sachtler Flowtech 75", "Statywy", true],
  [13, "Gimbal DJI RS 3 Pro", "Stabilizacja", true], [14, "Lampa Aputure 300D II", "Światło", true], [15, "Lampa Aputure 120D", "Światło", true],
  [16, "Panel LED Godox SL60", "Światło", true], [17, "Monitor Atomos Ninja V", "Monitory", true], [18, "Dysk Samsung T7 2 TB", "Nośniki", true],
  [19, "Karta CFexpress 512 GB", "Nośniki", true], [20, "Słuchawki Sony MDR-7506", "Dźwięk", true],
  [101, "Kabel XLR 5 m", "Kable", false], [102, "Kabel HDMI 3 m", "Kable", false], [103, "Zestaw akumulatorów NP-FZ100", "Zasilanie", false],
  [104, "Przedłużacz 10 m", "Zasilanie", false], [105, "Blenda 5w1", "Światło", false], [106, "Flaga czarna 60x90", "Światło", false],
];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function seed(): State {
  const r = rng(7);
  let id = 1000;
  const nid = () => ++id;
  const items: Item[] = CATALOG.map(([kod, nazwa, kategoria, maQr]) => ({
    kod, nazwa, kategoria, maQr, status: "w_studiu", ktoMa: null, email: null, odKiedy: null, jest: true, sprawdzono: ago(2 * D), miejsce: null, planowanyZwrot: null,
  }));
  const hist: Hist[] = [];
  const addH = (rodzaj: "sprzet" | "wizyta", kiedy: string, akcja: string, kod: number | null, kto: string, email: string, uwagi: string | null = null, zrodlo = "skaner") => {
    const it = kod != null ? items.find((i) => i.kod === kod) : null;
    hist.push({ id: nid(), rodzaj, kiedy, akcja, kod, nazwa: it?.nazwa ?? "", kto, email, uwagi, zrodlo });
  };
  const lend = (kod: number, p: { email: string; imie: string }, ageMs: number, extra: Partial<Item> = {}) => {
    const it = items.find((i) => i.kod === kod)!;
    Object.assign(it, { status: "wypozyczony", ktoMa: p.imie, email: p.email, odKiedy: ago(ageMs), jest: true }, extra);
    addH("sprzet", ago(ageMs), extra.status === "poza_szkola" ? "Poza szkołą" : "Biorę", kod, p.imie, p.email, extra.miejsce ?? null);
  };

  // wypożyczenia „na teraz”
  lend(3, PEOPLE[0], 5 * H);
  lend(8, PEOPLE[1], 30 * H);
  lend(12, PEOPLE[2], 50 * H, { jest: false });
  lend(5, { email: DEMO_ME.email, imie: DEMO_ME.imie }, 2 * H);
  lend(104, PEOPLE[3], 6 * H);
  lend(9, PEOPLE[3], 3 * D, { status: "poza_szkola", miejsce: "w domu · nagranie podcastu", planowanyZwrot: dayStr(-2 * D) });
  lend(10, PEOPLE[0], 1 * D, { status: "poza_szkola", miejsce: "plener, Gdańsk", planowanyZwrot: dayStr(2 * D) });
  items.find((i) => i.kod === 17)!.jest = false;
  items.find((i) => i.kod === 106)!.jest = false;

  // historia z ostatnich 14 dni (pary Biorę / Oddaję)
  const hours = [9, 10, 11, 12, 13, 14, 15, 16];
  for (let day = 14; day >= 1; day--) {
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const p = PEOPLE[Math.floor(r() * PEOPLE.length)];
      const it = items[Math.floor(r() * items.length)];
      if (["wypozyczony", "poza_szkola"].includes(it.status)) continue;
      const t0 = Date.now() - day * D + (hours[Math.floor(r() * hours.length)] - 12) * H;
      addH("sprzet", new Date(t0).toISOString(), "Biorę", it.kod, p.imie, p.email);
      addH("sprzet", new Date(t0 + (1 + Math.floor(r() * 5)) * H).toISOString(), "Oddaję", it.kod, p.imie, p.email);
    }
    if (day % 3 === 0) addH("sprzet", new Date(Date.now() - day * D + 2 * H).toISOString(), "Sprawdzam", 1 + Math.floor(r() * 20), PEOPLE[1].imie, PEOPLE[1].email, null, "aplikacja");
  }
  addH("sprzet", ago(20 * H), "Biorę", 999, PEOPLE[2].imie, PEOPLE[2].email, "Nieznany kod z naklejki", "skaner");
  hist[hist.length - 1].nazwa = "(nieznany kod)";
  hist.sort((a, b) => +new Date(b.kiedy) - +new Date(a.kiedy));

  // wizyty
  const visits: Visit[] = [];
  const allVisitors = [...PEOPLE, DEMO_ME];
  for (let day = 30; day >= 1; day--) {
    if (r() < 0.35) continue;
    const p = allVisitors[Math.floor(r() * allVisitors.length)];
    const start = Date.now() - day * D + (9 + Math.floor(r() * 4) - 12) * H;
    const auto = r() < 0.12;
    const len = auto ? 21 * H - (9 * H) : (1 + Math.floor(r() * 5)) * H + Math.floor(r() * 3_600_000);
    const v: Visit = { id: nid(), imie: p.imie, email: p.email, wejscie: new Date(start).toISOString(), wyjscie: new Date(start + len).toISOString(), auto, zamknietaPrzez: null, sprzetPrzyWyjsciu: [] };
    visits.push(v);
    addH("wizyta", v.wejscie, "Check-in", null, p.imie, p.email, null, "kod_drzwi");
    addH("wizyta", v.wyjscie!, "Check-out", null, p.imie, p.email, auto ? "automatyczny (21:00)" : null, auto ? "auto" : "aplikacja");
  }
  for (const [p, h] of [[PEOPLE[0], 4], [PEOPLE[1], 2]] as const) {
    const v: Visit = { id: nid(), imie: p.imie, email: p.email, wejscie: ago(h * H), wyjscie: null, auto: false, zamknietaPrzez: null, sprzetPrzyWyjsciu: [] };
    visits.push(v);
    addH("wizyta", v.wejscie, "Check-in", null, p.imie, p.email, null, "kod_drzwi");
  }
  hist.sort((a, b) => +new Date(b.kiedy) - +new Date(a.kiedy));

  const rez: Rez[] = [
    { id: 1, imie: PEOPLE[0].imie, email: PEOPLE[0].email, od: ahead(20 * H), do: ahead(24 * H), cel: "Wywiad z dyrektorem", status: "oczekuje", powod: null, decyzjaPrzez: null, utworzono: ago(3 * H), kody: [1, 4, 7] },
    { id: 2, imie: PEOPLE[1].imie, email: PEOPLE[1].email, od: ahead(22 * H), do: ahead(26 * H), cel: "Relacja z konkursu", status: "oczekuje", powod: null, decyzjaPrzez: null, utworzono: ago(5 * H), kody: [1, 13] },
    { id: 3, imie: PEOPLE[2].imie, email: PEOPLE[2].email, od: ahead(28 * H), do: ahead(32 * H), cel: "Sesja zdjęciowa", status: "zatwierdzona", powod: null, decyzjaPrzez: "Administrator", utworzono: ago(1 * D), kody: [2, 14, 15] },
    { id: 4, imie: DEMO_ME.imie, email: DEMO_ME.email, od: ahead(3 * D), do: ahead(3 * D + 3 * H), cel: "Nagranie lekcji", status: "zatwierdzona", powod: null, decyzjaPrzez: "Administrator", utworzono: ago(1 * D), kody: [3, 11] },
    { id: 5, imie: DEMO_ME.imie, email: DEMO_ME.email, od: ago(4 * D), do: ago(4 * D - 2 * H), cel: "Test światła", status: "odrzucona", powod: "Sprzęt w serwisie.", decyzjaPrzez: "Administrator", utworzono: ago(6 * D), kody: [14] },
  ];

  const users: User[] = [
    { oid: "demo", email: DEMO_ME.email, imie: DEMO_ME.imie, rola: "admin", status: "aktywny", powod: null, dodanyRecznie: false, adminZKonfiguracji: true, dodal: null, zaakceptowal: null, pierwsze: ago(90 * D), ostatnie: ago(0) },
    ...PEOPLE.map((p, i): User => ({ oid: `u${i}`, email: p.email, imie: p.imie, rola: i === 0 ? "admin" : "uzytkownik", status: "aktywny", powod: null, dodanyRecznie: i === 3, adminZKonfiguracji: false, dodal: i === 3 ? DEMO_ME.imie : null, zaakceptowal: DEMO_ME.imie, pierwsze: ago((60 - i * 7) * D), ostatnie: ago(i * H) })),
    { oid: "u10", email: "ewa.lis@example.pl", imie: "Ewa Lis", rola: "uzytkownik", status: "oczekuje", powod: null, dodanyRecznie: false, adminZKonfiguracji: false, dodal: null, zaakceptowal: null, pierwsze: ago(2 * H), ostatnie: ago(2 * H) },
    { oid: "u11", email: "tomasz.mazur@example.pl", imie: "Tomasz Mazur", rola: "uzytkownik", status: "zablokowany", powod: "Konto uczestnika, który zakończył kurs.", dodanyRecznie: false, adminZKonfiguracji: false, dodal: null, zaakceptowal: null, pierwsze: ago(120 * D), ostatnie: ago(40 * D) },
  ];

  const audit: Audit[] = [];
  const au = (ms: number, zdarzenie: string, wynik: Audit["wynik"], email: string | null, obiekt: string | null = null, szczegoly: Record<string, unknown> | null = null) =>
    audit.push({ id: nid(), kiedy: ago(ms), zdarzenie, obiekt, szczegoly, wynik, email });
  for (let i = 0; i < 40; i++) {
    const p = allVisitors[Math.floor(r() * allVisitors.length)];
    au(i * 5 * H + Math.floor(r() * H), r() < 0.8 ? "logowanie" : "akcja", "ok", p.email, r() < 0.5 ? "/login" : "/api/akcja");
  }
  au(7 * H, "logowanie", "odmowa", "obcy@gmail.com", "/login", { powod: "domena" });
  au(9 * H, "limit", "limit", "anna.kowalska@example.pl", "/api/akcja");
  au(26 * H, "akceptacja_uzytkownika", "ok", DEMO_ME.email, "u3", { rola: "uzytkownik" });
  audit.sort((a, b) => +new Date(b.kiedy) - +new Date(a.kiedy));

  const events: Event[] = [{ id: 1, rodzaj: "brak", temat: "Studio: Brak po inwentaryzacji: Monitor Atomos Ninja V", kod: 17, kiedy: ago(3 * H) }];

  return { v: 1, rola: "admin", items, hist, visits, rez, users, audit, events, settings: { cisza: { od: "21:00", do: "07:00" }, inwentaryzacjaTylkoAdmin: false, checkinWCiszy: "odrzucaj" }, doorVersion: 1, nextId: id + 1, seen: [] };
}

// ---------- stan ----------
let S: State | null = null;
function st(): State {
  if (S) return S;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (p.v === 1) return (S = p);
    }
  } catch {
    /* brak localStorage — stan tylko w pamięci */
  }
  return (S = seed());
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* ignoruj */
  }
}
export function resetDemo() {
  S = seed();
  save();
}
export function getRole() {
  return st().rola;
}
export function setRole(r: "admin" | "uzytkownik") {
  st().rola = r;
  const u = st().users.find((x) => x.oid === "demo");
  if (u) u.rola = r;
  save();
}

const nextId = () => st().nextId++;
const openVisit = () => st().visits.find((v) => v.email === DEMO_ME.email && !v.wyjscie) ?? null;
const err = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};

function nextRez(kod: number) {
  const now = Date.now();
  const r = st()
    .rez.filter((x) => x.status === "zatwierdzona" && x.kody.includes(kod) && +new Date(x.do) > now)
    .sort((a, b) => +new Date(a.od) - +new Date(b.od))[0];
  return r ? { imie: r.imie, email: r.email, od: r.od, do: r.do } : null;
}
function view(i: Item) {
  return { ...i, rezerwacja: nextRez(i.kod) };
}
const hold = (kod: number | null, akcja: string, uwagi: string | null, zrodlo: string, nazwaOverride?: string) => {
  const it = kod != null ? st().items.find((i) => i.kod === kod) : null;
  st().hist.unshift({ id: nextId(), rodzaj: kod != null ? "sprzet" : "wizyta", kiedy: new Date().toISOString(), akcja, kod, nazwa: nazwaOverride ?? it?.nazwa ?? "", kto: DEMO_ME.imie, email: DEMO_ME.email, uwagi, zrodlo });
};
const audit = (zdarzenie: string, obiekt: string | null = null, szczegoly: Record<string, unknown> | null = null) =>
  st().audit.unshift({ id: nextId(), kiedy: new Date().toISOString(), zdarzenie, obiekt, szczegoly, wynik: "ok", email: DEMO_ME.email });

function counters() {
  const items = st().items;
  const now = Date.now();
  return {
    wszystkie: items.length,
    sprawdzone: items.filter((i) => i.jest).length,
    poza: items.filter((i) => i.status !== "w_studiu").length,
    pozaSzkola: items.filter((i) => i.status === "poza_szkola").length,
    ponad24: items.filter((i) => i.status === "wypozyczony" && i.odKiedy && now - +new Date(i.odKiedy) > D).length,
  };
}

type Stan = "wolny" | "zajety" | "oczekuje" | "poza_szkola" | "wypozyczony";
function availability(od: Date, doo: Date) {
  const s = st();
  const overlap = (r: Rez) => +new Date(r.od) < +doo && +new Date(r.do) > +od;
  return s.items.map((i) => {
    const approved = s.rez.find((r) => r.status === "zatwierdzona" && r.kody.includes(i.kod) && overlap(r));
    const pending = s.rez.filter((r) => r.status === "oczekuje" && r.kody.includes(i.kod) && overlap(r));
    let stan: Stan = "wolny";
    let opis: string | null = null;
    if (approved) [stan, opis] = ["zajety", `${approved.imie}, ${hm(approved.od)}–${hm(approved.do)}`];
    else if (i.status === "poza_szkola") [stan, opis] = ["poza_szkola", [i.ktoMa, i.miejsce].filter(Boolean).join(" · ")];
    else if (i.status === "wypozyczony" && +od < Date.now() + 12 * H) [stan, opis] = ["wypozyczony", i.ktoMa];
    else if (pending.length) [stan, opis] = ["oczekuje", pending.map((p) => p.imie).join(", ")];
    return { kod: i.kod, nazwa: i.nazwa, kategoria: i.kategoria, stan, opis };
  });
}
const rezOut = (r: Rez) => ({ ...r, pozycje: r.kody.map((k) => ({ kod: k, nazwa: st().items.find((i) => i.kod === k)?.nazwa ?? String(k) })) });

function doorLink(prefix: "s" | "k") {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}${BASE}/c?t=${prefix}.${st().doorVersion}.demo`;
}

// ---------- router ----------
type Q = URLSearchParams;
export async function handle(path: string, method: string, body: Record<string, unknown> | undefined): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60)); // minimalne opóźnienie, żeby spinnery i szkielety miały co pokazać
  const out = route(new URL(path, "http://demo.local"), method, body ?? {});
  save();
  return JSON.parse(JSON.stringify(out ?? {}));
}

function route(u: URL, method: string, b: Record<string, unknown>): unknown {
  const s = st();
  const p = u.pathname.replace(/\/$/, "");
  const q: Q = u.searchParams;
  let m: RegExpMatchArray | null;

  // ----- użytkownik i obecność -----
  if (p === "/api/me") {
    const v = openVisit();
    return { email: DEMO_ME.email, imie: DEMO_ME.imie, rola: s.rola, inwentaryzacjaTylkoAdmin: s.settings.inwentaryzacjaTylkoAdmin, wizyta: v ? { id: v.id, imie: v.imie, wejscie: v.wejscie, wyjscie: v.wyjscie, auto: v.auto, sprzetPrzyWyjsciu: v.sprzetPrzyWyjsciu } : null };
  }
  if (p === "/api/obecnosc/teraz") return { osoby: s.visits.filter((v) => !v.wyjscie).map((v) => ({ id: v.id, imie: v.imie, wejscie: v.wejscie })) };
  if (p === "/api/obecnosc/moje") {
    const od = Date.now() - 30 * D;
    return { wizyty: s.visits.filter((v) => v.email === DEMO_ME.email && +new Date(v.wejscie) > od).sort((a, b) => +new Date(b.wejscie) - +new Date(a.wejscie)) };
  }
  if (p === "/api/obecnosc/checkin" && method === "POST") {
    const token = String(b.token ?? "");
    const ver = token.match(/^[sk]\.(\d+)\./);
    if (!ver) return err(400, "zly_kod", "To nie jest kod drzwi studia.");
    if (Number(ver[1]) !== s.doorVersion) return err(403, "kod_nieaktualny", "Ten kod drzwi jest nieaktualny. Zeskanuj nowy kod przy wejściu.");
    const open = openVisit();
    if (open) return { juz: true, wizyta: open };
    const v: Visit = { id: nextId(), imie: DEMO_ME.imie, email: DEMO_ME.email, wejscie: new Date().toISOString(), wyjscie: null, auto: false, zamknietaPrzez: null, sprzetPrzyWyjsciu: [] };
    s.visits.push(v);
    hold(null, "Check-in", null, "kod_drzwi");
    return { juz: false, wizyta: v };
  }
  if (p === "/api/obecnosc/checkout" && method === "POST") {
    const v = openVisit();
    if (!v) return err(409, "brak_wizyty", "Nie masz otwartej wizyty.");
    const held = s.items.filter((i) => i.status === "wypozyczony" && i.email === DEMO_ME.email);
    if (held.length && !b.potwierdzam) return { wymagaPotwierdzenia: true, sprzet: held.map(view), wizyta: v };
    v.wyjscie = new Date().toISOString();
    v.sprzetPrzyWyjsciu = held.map((i) => i.kod);
    hold(null, "Check-out", held.length ? `przy sobie: ${held.map((i) => i.kod).join(", ")}` : null, String(b.zrodlo ?? "aplikacja"));
    return { wymagaPotwierdzenia: false, sprzet: held.map(view), wizyta: v };
  }

  // ----- sprzęt -----
  if (p === "/api/sprzet") {
    const filtr = q.get("filtr") ?? "wszystko";
    let list = [...s.items].sort((a, b) => a.kod - b.kod);
    if (filtr === "wypozyczone") list = list.filter((i) => i.status !== "w_studiu").sort((a, b) => +new Date(a.odKiedy ?? 0) - +new Date(b.odKiedy ?? 0));
    if (filtr === "brakuje") list = list.filter((i) => !i.jest);
    if (filtr === "bezqr") list = list.filter((i) => !i.maQr);
    return { lista: list.map(view), liczniki: counters() };
  }
  if ((m = p.match(/^\/api\/sprzet\/(\d+)\/jest$/)) && method === "PATCH") {
    const it = s.items.find((i) => i.kod === Number(m![1]));
    if (!it) return err(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
    it.jest = !!b.jest;
    it.sprawdzono = b.jest ? new Date().toISOString() : null;
    return { pozycja: view(it) };
  }
  if (p === "/api/akcja" && method === "POST") {
    const rid = String(b.request_id ?? "");
    const kod = Number(b.kod);
    const it = s.items.find((i) => i.kod === kod);
    if (rid && s.seen.includes(rid)) return { pozycja: it ? view(it) : null, duplikat: true };
    if (rid) s.seen = [...s.seen.slice(-50), rid];
    const uwagi = typeof b.uwagi === "string" && b.uwagi.trim() ? b.uwagi.trim() : null;
    const zrodlo = String(b.zrodlo ?? "aplikacja");
    const label = b.akcja === "biore" ? "Biorę" : b.akcja === "oddaje" ? "Oddaję" : "Sprawdzam";
    if (!it) {
      hold(kod, label, uwagi, zrodlo, "(nieznany kod)");
      s.events.unshift({ id: nextId(), rodzaj: "nieznany_kod", temat: `Studio: Nieznany kod ${kod} (${label})`, kod, kiedy: new Date().toISOString() });
      return { pozycja: null, nieznany: true };
    }
    let ostrzezenie: string | undefined;
    if (b.akcja === "biore") {
      const rez = s.rez.find((r) => r.status === "zatwierdzona" && r.kody.includes(kod) && r.email !== DEMO_ME.email && +new Date(r.od) < Date.now() + 2 * H && +new Date(r.do) > Date.now());
      if (rez) ostrzezenie = `Uwaga: ten sprzęt jest zarezerwowany dla ${rez.imie} (${hm(rez.od)}–${hm(rez.do)}). Zapisano, ale ustal to z tą osobą.`;
      Object.assign(it, { status: "wypozyczony", ktoMa: DEMO_ME.imie, email: DEMO_ME.email, odKiedy: new Date().toISOString(), jest: true, miejsce: null, planowanyZwrot: null });
    } else if (b.akcja === "oddaje") {
      Object.assign(it, { status: "w_studiu", ktoMa: null, email: null, odKiedy: null, jest: true, sprawdzono: new Date().toISOString(), miejsce: null, planowanyZwrot: null });
    } else {
      Object.assign(it, { status: "w_studiu", ktoMa: null, email: null, odKiedy: null, jest: true, sprawdzono: new Date().toISOString() });
    }
    hold(kod, label, uwagi, zrodlo);
    return { pozycja: view(it), ...(ostrzezenie ? { ostrzezenie } : {}) };
  }
  if (p === "/api/przypomnij" && method === "POST") {
    const email = String(b.email ?? "").toLowerCase();
    const n = s.items.filter((i) => i.status !== "w_studiu" && i.email === email).length;
    if (n) audit("przypomnienie", email);
    return { pozycje: n };
  }
  if (p === "/api/inwentaryzacja/start" && method === "POST") {
    s.items.forEach((i) => ((i.jest = false), (i.sprawdzono = null)));
    audit("inwentaryzacja_start");
    return { zmienione: s.items.length };
  }
  if (p === "/api/inwentaryzacja/przypomnienia" && method === "POST") {
    const braki = s.items.filter((i) => !i.jest);
    return { braki: braki.length, osoby: new Set(s.items.filter((i) => i.status !== "w_studiu" && i.email).map((i) => i.email)).size };
  }

  // ----- rezerwacje -----
  if (p === "/api/rezerwacje/dostepnosc") return { dostepnosc: availability(new Date(q.get("od") ?? Date.now()), new Date(q.get("do") ?? Date.now())) };
  if (p === "/api/rezerwacje" && method === "GET") return { rezerwacje: s.rez.filter((r) => r.email === DEMO_ME.email).sort((a, b) => +new Date(b.od) - +new Date(a.od)).map(rezOut) };
  if (p === "/api/rezerwacje" && method === "POST") {
    const kody = (b.kody as number[] | undefined) ?? [];
    if (!kody.length) return err(400, "pusto", "Wybierz co najmniej jeden sprzęt.");
    const od = new Date(String(b.od));
    const doo = new Date(String(b.do));
    if (!(doo > od)) return err(400, "termin", "Koniec musi być po początku.");
    const zajete = availability(od, doo).filter((a) => kody.includes(a.kod) && a.stan === "zajety");
    if (zajete.length) return err(409, "zajete", `Zajęte w tym terminie: ${zajete.map((z) => z.nazwa).join(", ")}.`);
    s.rez.push({ id: nextId(), imie: DEMO_ME.imie, email: DEMO_ME.email, od: od.toISOString(), do: doo.toISOString(), cel: (b.cel as string) || null, status: "oczekuje", powod: null, decyzjaPrzez: null, utworzono: new Date().toISOString(), kody });
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/rezerwacje\/(\d+)\/anuluj$/)) && method === "POST") {
    const r = s.rez.find((x) => x.id === Number(m![1]));
    if (!r) return err(404, "nie_ma", "Nie ma takiej rezerwacji.");
    r.status = "anulowana";
    return { ok: true };
  }
  if (p === "/api/admin/rezerwacje" && method === "GET") {
    const now = Date.now();
    const sorted = [...s.rez];
    return {
      oczekujace: sorted.filter((r) => r.status === "oczekuje" && +new Date(r.do) > now).sort((a, b) => +new Date(a.od) - +new Date(b.od)).map((r) => ({ ...rezOut(r), dostepnosc: availability(new Date(r.od), new Date(r.do)).filter((a) => r.kody.includes(a.kod)).map((a) => ({ kod: a.kod, nazwa: a.nazwa, stan: a.stan, opis: a.opis })) })),
      nadchodzace: sorted.filter((r) => r.status === "zatwierdzona" && +new Date(r.do) > now).sort((a, b) => +new Date(a.od) - +new Date(b.od)).map(rezOut),
      ostatnie: sorted.filter((r) => r.status !== "oczekuje" && !(r.status === "zatwierdzona" && +new Date(r.do) > now)).sort((a, b) => +new Date(b.utworzono) - +new Date(a.utworzono)).slice(0, 15).map(rezOut),
    };
  }
  if ((m = p.match(/^\/api\/admin\/rezerwacje\/(\d+)$/)) && method === "POST") {
    const r = s.rez.find((x) => x.id === Number(m![1]));
    if (!r) return err(404, "nie_ma", "Nie ma takiej rezerwacji.");
    if (b.decyzja === "zatwierdz") {
      const clash = s.rez.find((x) => x.id !== r.id && x.status === "zatwierdzona" && x.kody.some((k) => r.kody.includes(k)) && +new Date(x.od) < +new Date(r.do) && +new Date(x.do) > +new Date(r.od));
      if (clash) return err(409, "nakladanie", "Ten sprzęt ma już zatwierdzoną rezerwację w tym terminie.");
      r.status = "zatwierdzona";
    } else {
      r.status = "odrzucona";
      r.powod = (b.powod as string) || null;
    }
    r.decyzjaPrzez = DEMO_ME.imie;
    audit("rezerwacja_decyzja", String(r.id), { decyzja: b.decyzja });
    return { ok: true };
  }

  // ----- panel administratora -----
  if (p === "/api/admin/pulpit") {
    const now = Date.now();
    const today = dayStr(0);
    const todayH = s.hist.filter((h) => h.rodzaj === "sprzet" && dayStr(+new Date(h.kiedy) - now) === today);
    const items = s.items;
    const c = counters();
    const pozaPoTerminie = items.filter((i) => i.status === "poza_szkola" && i.planowanyZwrot && i.planowanyZwrot < today);
    const aktywnosc = Array.from({ length: 14 }, (_, k) => {
      const dz = dayStr(-(13 - k) * D);
      const rows = s.hist.filter((h) => h.rodzaj === "sprzet" && dayStr(+new Date(h.kiedy) - now) === dz);
      return { dzien: dz, biore: rows.filter((h) => h.akcja === "Biorę").length, oddaje: rows.filter((h) => h.akcja === "Oddaję").length };
    });
    const top = new Map<number, number>();
    s.hist.filter((h) => h.akcja === "Biorę" && h.kod && now - +new Date(h.kiedy) < 30 * D).forEach((h) => top.set(h.kod!, (top.get(h.kod!) ?? 0) + 1));
    return {
      kafelki: {
        wszystkie: c.wszystkie, poza: c.poza, ponad24: c.ponad24, sprawdzone: c.sprawdzone, w_studiu_teraz: s.visits.filter((v) => !v.wyjscie).length,
        biore_dzis: todayH.filter((h) => h.akcja === "Biorę").length, oddaje_dzis: todayH.filter((h) => h.akcja === "Oddaję").length,
        auto_wczoraj: s.visits.filter((v) => v.auto && v.wyjscie && now - +new Date(v.wyjscie) < D).length,
        poza_szkola: c.pozaSzkola, osoby_oczekuja: s.users.filter((x) => x.status === "oczekuje").length,
        rezerwacje_oczekuja: s.rez.filter((r) => r.status === "oczekuje" && +new Date(r.do) > now).length,
        rezerwacje_dzis: s.rez.filter((r) => r.status === "zatwierdzona" && dayStr(+new Date(r.od) - now) === today).length,
      },
      uwaga: {
        ponad24: items.filter((i) => i.status === "wypozyczony" && i.odKiedy && now - +new Date(i.odKiedy) > D).map(view),
        zdarzenia: s.events.slice(0, 5),
        zablokowani: s.users.filter((x) => x.status === "zablokowany").map((x) => ({ oid: x.oid, email: x.email, imie: x.imie, powod: x.powod })),
        oczekujaOsoby: s.users.filter((x) => x.status === "oczekuje").map((x) => ({ oid: x.oid, email: x.email, imie: x.imie })),
        pozaPoTerminie: pozaPoTerminie.map(view),
      },
      teraz: s.visits.filter((v) => !v.wyjscie).map((v) => ({ id: v.id, imie: v.imie, email: v.email, wejscie: v.wejscie, przySobie: items.filter((i) => i.status !== "w_studiu" && i.email === v.email).map((i) => ({ kod: i.kod, nazwa: i.nazwa })) })),
      aktywnosc,
      top: [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([kod, ile]) => ({ kod, nazwa: items.find((i) => i.kod === kod)?.nazwa ?? String(kod), ile })),
      ostatnie: s.hist.filter((h) => h.rodzaj === "sprzet").slice(0, 8).map((h) => ({ rodzaj: h.rodzaj, id: h.id, kiedy: h.kiedy, akcja: h.akcja, kod: h.kod, nazwa: h.nazwa, kto: h.kto })),
    };
  }
  if (p === "/api/admin/historia") {
    const od = q.get("od"), doo = q.get("do"), osoba = (q.get("osoba") ?? "").toLowerCase(), kod = q.get("kod"), typ = q.get("typ"), uw = (q.get("uwagi") ?? "").toLowerCase();
    const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date(iso));
    let rows = s.hist.filter((h) => {
      if (od && day(h.kiedy) < od) return false;
      if (doo && day(h.kiedy) > doo) return false;
      if (osoba && !`${h.kto} ${h.email}`.toLowerCase().includes(osoba)) return false;
      if (kod && String(h.kod) !== kod) return false;
      if (uw && !(h.uwagi ?? "").toLowerCase().includes(uw)) return false;
      if (typ === "biore") return h.akcja === "Biorę";
      if (typ === "oddaje") return h.akcja === "Oddaję";
      if (typ === "sprawdzam") return h.akcja === "Sprawdzam";
      if (typ === "wizyta") return h.rodzaj === "wizyta";
      if (typ === "nieznany") return h.nazwa === "(nieznany kod)";
      return true;
    });
    rows = rows.sort((a, b) => +new Date(b.kiedy) - +new Date(a.kiedy));
    const naStrone = 50;
    const strona = Math.max(1, Number(q.get("strona")) || 1);
    return { wpisy: rows.slice((strona - 1) * naStrone, strona * naStrone), razem: rows.length, strona, naStrone };
  }
  if (p === "/api/admin/obecnosci") {
    const od = q.get("od") ?? "0000", doo = q.get("do") ?? "9999";
    const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date(iso));
    const wizyty = s.visits.filter((v) => day(v.wejscie) >= od && day(v.wejscie) <= doo).sort((a, b) => +new Date(b.wejscie) - +new Date(a.wejscie));
    const by = new Map<string, { email: string; imie: string; wizyty: number; minuty: number; auto: number }>();
    for (const v of wizyty) {
      const o = by.get(v.email) ?? { email: v.email, imie: v.imie, wizyty: 0, minuty: 0, auto: 0 };
      o.wizyty++;
      o.minuty += Math.round(((v.wyjscie ? +new Date(v.wyjscie) : Date.now()) - +new Date(v.wejscie)) / 60_000);
      if (v.auto) o.auto++;
      by.set(v.email, o);
    }
    return { osoby: [...by.values()].sort((a, b) => b.minuty - a.minuty), wizyty };
  }
  if ((m = p.match(/^\/api\/admin\/obecnosc\/(\d+)\/zamknij$/)) && method === "POST") {
    const v = s.visits.find((x) => x.id === Number(m![1]));
    if (!v || v.wyjscie) return err(409, "zamknieta", "Ta wizyta jest już zamknięta.");
    v.wyjscie = new Date().toISOString();
    v.zamknietaPrzez = DEMO_ME.imie;
    audit("wizyta_zamknieta", String(v.id), { powod: b.powod });
    return { ok: true };
  }
  if (p === "/api/admin/audyt") {
    const strona = Math.max(1, Number(q.get("strona")) || 1);
    return { wpisy: s.audit.slice((strona - 1) * 100, strona * 100) };
  }
  if ((m = p.match(/^\/api\/admin\/sprzet\/(\d+)\/os-czasu$/))) {
    const kod = Number(m[1]);
    const it = s.items.find((i) => i.kod === kod);
    return { pozycja: it ? view(it) : null, os: s.hist.filter((h) => h.kod === kod).slice(0, 40).map((h) => ({ kiedy: h.kiedy, typ: h.akcja, kto: h.kto, uwagi: h.uwagi })) };
  }
  if ((m = p.match(/^\/api\/admin\/sprzet\/(\d+)\/poza-szkola$/)) && method === "POST") {
    const it = s.items.find((i) => i.kod === Number(m![1]));
    if (!it) return err(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
    const email = String(b.email ?? "").toLowerCase();
    const osoba = s.users.find((x) => x.email === email && x.status === "aktywny");
    if (!osoba) return err(400, "zla_osoba", "Wybierz aktywną osobę z listy użytkowników.");
    Object.assign(it, { status: "poza_szkola", ktoMa: osoba.imie, email, odKiedy: new Date().toISOString(), jest: false, miejsce: String(b.miejsce ?? ""), planowanyZwrot: (b.planowanyZwrot as string) || null });
    hold(it.kod, "Poza szkołą", [b.miejsce, b.uwagi].filter(Boolean).join(" · ") || null, "panel");
    return { ok: true };
  }
  if (p === "/api/admin/sprzet" && method === "POST") {
    const kod = Number(b.kod);
    if (!Number.isInteger(kod) || kod < 1) return err(400, "kod", "Podaj poprawny kod (liczba całkowita od 1).");
    if (s.items.some((i) => i.kod === kod)) return err(409, "zajety_kod", `Kod ${kod} już istnieje.`);
    s.items.push({ kod, nazwa: String(b.nazwa ?? "").trim() || `Sprzęt ${kod}`, kategoria: String(b.kategoria ?? ""), maQr: kod < 101, status: "w_studiu", ktoMa: null, email: null, odKiedy: null, jest: true, sprawdzono: new Date().toISOString(), miejsce: null, planowanyZwrot: null });
    audit("sprzet_dodany", String(kod));
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/admin\/sprzet\/(\d+)$/)) && method === "PATCH") {
    const it = s.items.find((i) => i.kod === Number(m![1]));
    if (!it) return err(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
    Object.assign(it, { nazwa: b.nazwa ?? it.nazwa, kategoria: b.kategoria ?? it.kategoria, maQr: b.maQr ?? it.maQr });
    return { pozycja: view(it) };
  }
  if (p === "/api/admin/ustawienia") {
    if (method === "PATCH") {
      s.settings = { cisza: (b.cisza as State["settings"]["cisza"]) ?? s.settings.cisza, inwentaryzacjaTylkoAdmin: !!b.inwentaryzacjaTylkoAdmin, checkinWCiszy: b.checkinWCiszy === "pozwalaj" ? "pozwalaj" : "odrzucaj" };
      audit("ustawienia_zmienione");
    }
    return { ...s.settings, administratorzy: ["admin@example.pl"], powiadomienia: ["admin@example.pl"] };
  }
  if (p === "/api/admin/kod-drzwi") return { wersja: s.doorVersion, link: doorLink("s") };
  if (p === "/api/admin/kod-drzwi/rotuj" && method === "POST") {
    s.doorVersion++;
    audit("kod_drzwi_rotacja");
    return { wersja: s.doorVersion, link: doorLink("s") };
  }
  if (p === "/api/admin/kod-drzwi/kiosk") return { link: doorLink("k"), odswiezZa: 30 - (Math.floor(Date.now() / 1000) % 30) };
  if (p === "/api/admin/uzytkownicy" && method === "GET") return { uzytkownicy: s.users };
  if (p === "/api/admin/uzytkownicy" && method === "POST") {
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(400, "email", "Podaj poprawny adres e-mail.");
    if (s.users.some((x) => x.email === email)) return err(409, "jest", "Ta osoba jest już na liście.");
    s.users.push({ oid: `dodany:${nextId()}`, email, imie: String(b.imie ?? "").trim() || email, rola: b.rola === "admin" ? "admin" : "uzytkownik", status: "aktywny", powod: null, dodanyRecznie: true, adminZKonfiguracji: false, dodal: DEMO_ME.imie, zaakceptowal: DEMO_ME.imie, pierwsze: new Date().toISOString(), ostatnie: null });
    return { ok: true };
  }
  if ((m = p.match(/^\/api\/admin\/uzytkownicy\/(.+)$/))) {
    const oid = decodeURIComponent(m[1]);
    const idx = s.users.findIndex((x) => x.oid === oid);
    if (idx < 0) return err(404, "nie_ma", "Nie ma takiej osoby.");
    const x = s.users[idx];
    if (method === "DELETE") {
      if (x.adminZKonfiguracji) return err(400, "startowy", "Administratora startowego nie da się usunąć.");
      s.users.splice(idx, 1);
      return { ok: true };
    }
    switch (b.akcja) {
      case "akceptuj": x.status = "aktywny"; x.zaakceptowal = DEMO_ME.imie; break;
      case "odrzuc": case "zablokuj":
        if (x.adminZKonfiguracji) return err(400, "startowy", "Administratora startowego nie da się zablokować.");
        x.status = "zablokowany"; x.powod = (b.powod as string) || null; break;
      case "odblokuj": x.status = "aktywny"; x.powod = null; break;
      case "rola":
        if (x.adminZKonfiguracji && b.rola !== "admin") return err(400, "startowy", "Administratora startowego nie da się zdegradować.");
        x.rola = b.rola === "admin" ? "admin" : "uzytkownik"; break;
    }
    audit("uzytkownik_zmieniony", x.email, { akcja: b.akcja });
    return { ok: true };
  }

  return err(404, "brak_endpointu", "W trybie demo ta funkcja nie jest dostępna.");
}
