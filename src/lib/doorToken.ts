import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token kodu przy drzwiach studia.
 *  - statyczny (naklejka):  s.<wersja>.<podpis>
 *  - kiosk (co 30 s):       k.<wersja>.<okno>.<podpis>   okno = floor(unix/30)
 * Podpis = HMAC-SHA256(DOOR_SECRET, treść), base64url, skrócony do 22 znaków (~128 bitów).
 * Zmiana wersji w ustawieniach unieważnia wszystkie stare kody.
 */
const WINDOW_S = 30;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 22);
}

function safeEq(a: string, b: string): boolean {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export function makeStaticToken(secret: string, version: number): string {
  const body = `s.${version}`;
  return `${body}.${sign(secret, body)}`;
}

export function makeKioskToken(secret: string, version: number, now = Date.now()): string {
  const w = Math.floor(now / 1000 / WINDOW_S);
  const body = `k.${version}.${w}`;
  return `${body}.${sign(secret, body)}`;
}

export type DoorCheck =
  | { ok: true; kind: "naklejka" | "kiosk" }
  | { ok: false; reason: "format" | "podpis" | "wersja" | "wygasl" };

export function verifyDoorToken(
  token: string,
  secret: string,
  currentVersion: number,
  now = Date.now(),
): DoorCheck {
  if (typeof token !== "string" || token.length > 80) return { ok: false, reason: "format" };
  const parts = token.split(".");
  if (parts[0] === "s" && parts.length === 3) {
    const [, v, sig] = parts;
    if (!/^\d+$/.test(v)) return { ok: false, reason: "format" };
    if (!safeEq(sig, sign(secret, `s.${v}`))) return { ok: false, reason: "podpis" };
    if (+v !== currentVersion) return { ok: false, reason: "wersja" };
    return { ok: true, kind: "naklejka" };
  }
  if (parts[0] === "k" && parts.length === 4) {
    const [, v, w, sig] = parts;
    if (!/^\d+$/.test(v) || !/^\d+$/.test(w)) return { ok: false, reason: "format" };
    if (!safeEq(sig, sign(secret, `k.${v}.${w}`))) return { ok: false, reason: "podpis" };
    if (+v !== currentVersion) return { ok: false, reason: "wersja" };
    const cur = Math.floor(now / 1000 / WINDOW_S);
    // ±30 s: bieżące okno i sąsiednie
    if (Math.abs(cur - +w) > 1) return { ok: false, reason: "wygasl" };
    return { ok: true, kind: "kiosk" };
  }
  return { ok: false, reason: "format" };
}
