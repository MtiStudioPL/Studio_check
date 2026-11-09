import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Logowanie kodem z maila: kod jednorazowy i bilet do Auth.js.
 *  - kod: 6 cyfr, w bazie tylko HMAC-SHA256(AUTH_SECRET, email|kod),
 *  - bilet: krótko żyjący, podpisany token, którym akcja serwera przekazuje Auth.js już zweryfikowaną osobę.
 */
export const CODE_TTL_MIN = 10;
export const CODE_MAX_TRIES = 5;
const TICKET_TTL_MS = 60_000;

const safeEq = (a: string, b: string) => {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
};

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(secret: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`kod|${email}|${code}`).digest("hex");
}

export function codeMatches(secret: string, email: string, code: string, hash: string): boolean {
  return /^\d{6}$/.test(code) && safeEq(hashCode(secret, email, code), hash);
}

export function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().slice(0, 254);
}

export function emailInDomain(email: string, domain: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.endsWith("@" + domain.toLowerCase());
}

/** Imię i nazwisko z adresu, gdy osoba go nie podała: jan.kowalski → Jan Kowalski. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  return (words.length ? words : [email]).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export type TicketPayload = { oid: string; email: string; name: string };

export function makeTicket(secret: string, p: TicketPayload, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ o: p.oid, e: p.email, n: p.name, x: now + TICKET_TTL_MS })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(`bilet|${body}`).digest("base64url")}`;
}

export function readTicket(secret: string, token: string, now = Date.now()): TicketPayload | null {
  if (typeof token !== "string" || token.length > 2000) return null;
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length) return null;
  if (!safeEq(sig, createHmac("sha256", secret).update(`bilet|${body}`).digest("base64url"))) return null;
  try {
    const j = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { o?: string; e?: string; n?: string; x?: number };
    if (!j.o || !j.e || typeof j.x !== "number" || j.x < now) return null;
    return { oid: j.o, email: j.e, name: j.n ?? j.e };
  } catch {
    return null;
  }
}

/**
 * Ochrona formularzy przed botami (obok BotID): token z czasem wydania, podpisany po stronie serwera.
 * Zbyt szybkie wysłanie (< 2 s od wyświetlenia) albo token starszy niż 2 h są odrzucane.
 */
const FORM_MIN_MS = 2_000;
const FORM_MAX_MS = 2 * 60 * 60_000;

export function makeFormToken(secret: string, now = Date.now()): string {
  const body = String(now);
  return `${body}.${createHmac("sha256", secret).update(`formularz|${body}`).digest("base64url")}`;
}

export function checkFormToken(secret: string, token: unknown, now = Date.now()): "ok" | "za_szybko" | "wygasl" | "zly" {
  if (typeof token !== "string" || token.length > 100) return "zly";
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length || !/^\d+$/.test(body)) return "zly";
  if (!safeEq(sig, createHmac("sha256", secret).update(`formularz|${body}`).digest("base64url"))) return "zly";
  const age = now - Number(body);
  if (age < FORM_MIN_MS) return "za_szybko";
  if (age > FORM_MAX_MS) return "wygasl";
  return "ok";
}
