"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Zapytanie do własnego API. Nigdy nie wysyła, kto wykonuje akcję — to wie serwer z sesji. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "siec", "Brak połączenia. Sprawdź internet i spróbuj ponownie.");
  }
  if (res.status === 401) {
    const next = location.pathname + location.search;
    location.href = `/login?next=${encodeURIComponent(next)}`;
    throw new ApiError(401, "brak_sesji", "Zaloguj się ponownie.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "blad", data.message ?? "Coś poszło nie tak.");
  return data as T;
}

export function uuid(): string {
  return crypto.randomUUID();
}

const TZ = "Europe/Warsaw";
export const fmtTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(",", "")
    : "";
export const fmtDayLong = (d = new Date()) =>
  new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
export const fmtDayHeader = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
export const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const hoursSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0);
export const fmtHours = (iso?: string | null) => {
  const h = hoursSince(iso);
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${Math.floor(h)} h`;
};
export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};
export const kod3 = (k: number | null | undefined) => (k == null ? "—" : String(k).padStart(3, "0"));
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
