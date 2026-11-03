// Wszystkie daty w bazie są w UTC. Tu jest jedyne miejsce, które zna Europe/Warsaw.
export const TZ = "Europe/Warsaw";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

export type WarsawParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 1 = poniedziałek … 7 = niedziela */
  weekday: number;
  /** YYYY-MM-DD w czasie warszawskim */
  dateStr: string;
  /** minuty od północy czasu warszawskiego */
  minutes: number;
};

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function warsaw(d: Date = new Date()): WarsawParts {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(d)) p[x.type] = x.value;
  const year = +p.year, month = +p.month, day = +p.day, hour = +p.hour, minute = +p.minute;
  return {
    year, month, day, hour, minute,
    weekday: WD[p.weekday],
    dateStr: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + minute,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dd.MM.yyyy HH:mm w czasie warszawskim (format z obecnych maili). */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const w = warsaw(new Date(d));
  return `${pad(w.day)}.${pad(w.month)}.${w.year} ${pad(w.hour)}:${pad(w.minute)}`;
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const w = warsaw(new Date(d));
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const w = warsaw(new Date(d));
  return `${pad(w.day)}.${pad(w.month)}.${w.year}`;
}

/** "HH:MM" → minuty od północy */
export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Czy dana chwila wypada w ciszy (domyślnie 21:00–7:00, przez północ). */
export function inQuiet(d: Date, od = "21:00", doo = "07:00"): boolean {
  const m = warsaw(d).minutes;
  const a = hm(od), b = hm(doo);
  return a > b ? m >= a || m < b : m >= a && m < b;
}

/**
 * Najbliższa chwila >= d poza ciszą. Jeśli d jest w ciszy, zwraca koniec ciszy (np. 7:00).
 * Liczone krokami po minucie na prawdziwym czasie UTC — odporne na zmianę czasu.
 */
export function nextOutsideQuiet(d: Date, od = "21:00", doo = "07:00"): Date {
  let t = new Date(d);
  for (let i = 0; i < 24 * 60 && inQuiet(t, od, doo); i++) {
    t = new Date(t.getTime() + 60_000);
  }
  return t;
}

/** Początek doby (00:00 Europe/Warsaw) zawierającej d, jako Date w UTC. */
export function startOfWarsawDay(d: Date = new Date()): Date {
  const w = warsaw(d);
  // Zgadnij offset: sprawdź obie możliwe strefy (+1 / +2) i wybierz tę, która daje północ.
  for (const off of [1, 2]) {
    const guess = new Date(Date.UTC(w.year, w.month - 1, w.day, -off, 0));
    const g = warsaw(guess);
    if (g.hour === 0 && g.minute === 0 && g.dateStr === w.dateStr) return guess;
  }
  return new Date(Date.UTC(w.year, w.month - 1, w.day, -1, 0));
}

export function hoursSince(d: Date | string | null | undefined, now = new Date()): number {
  if (!d) return 0;
  return (now.getTime() - new Date(d).getTime()) / 3_600_000;
}

export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${pad(m)} min` : `${m} min`;
}
