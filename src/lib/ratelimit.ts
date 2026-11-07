import "server-only";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Limity na osobę (klucz = oid z sesji), bo cała szkoła wychodzi do internetu z jednego IP.
 * Upstash Redis z Vercel Marketplace; bez niego (lokalnie) — licznik w pamięci procesu.
 */
type Rule = { limit: number; window: Duration };

export const RULES = {
  akcja_min: { limit: 20, window: "1 m" },
  akcja_dzien: { limit: 200, window: "1 d" },
  odhacz: { limit: 120, window: "1 m" },
  obecnosc: { limit: 6, window: "10 m" },
  przypomnij_adresat: { limit: 1, window: "30 m" },
  przypomnij_dzien: { limit: 20, window: "1 d" },
  inwentaryzacja: { limit: 1, window: "10 m" },
  anomalia_biore: { limit: 30, window: "10 m" },
  odczyt: { limit: 240, window: "1 m" },
  rezerwacja: { limit: 10, window: "1 d" },
  admin: { limit: 120, window: "1 m" },
  // Logowanie kodem z maila: klucz = adres e-mail albo IP (osoba jeszcze nie ma sesji).
  kod_email: { limit: 3, window: "10 m" },
  kod_ip: { limit: 30, window: "1 h" },
  kod_weryfikacja_ip: { limit: 30, window: "10 m" },
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
      ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
      : null;

if (!redis && process.env.NODE_ENV === "production") {
  console.warn("[limity] Brak Upstash Redis — limity liczone w pamięci jednej instancji. Podłącz Redis przed startem.");
}

const limiters = new Map<string, Ratelimit>();
function limiter(name: RuleName): Ratelimit | null {
  if (!redis) return null;
  let l = limiters.get(name);
  if (!l) {
    const r = RULES[name];
    l = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(r.limit, r.window), prefix: `studio:rl:${name}` });
    limiters.set(name, l);
  }
  return l;
}

// --- awaryjny licznik w pamięci ---
const mem = new Map<string, number[]>();
const durMs = (d: Duration): number => {
  const [n, u] = String(d).split(" ");
  const k = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[u as "ms" | "s" | "m" | "h" | "d"] ?? 6e4;
  return Number(n) * k;
};
function memHit(name: RuleName, key: string): boolean {
  const r = RULES[name];
  const now = Date.now();
  const id = `${name}:${key}`;
  const arr = (mem.get(id) ?? []).filter((t) => now - t < durMs(r.window));
  if (arr.length >= r.limit) {
    mem.set(id, arr);
    return false;
  }
  arr.push(now);
  mem.set(id, arr);
  return true;
}

/** true = mieści się w limicie */
export async function hit(name: RuleName, key: string): Promise<boolean> {
  const l = limiter(name);
  if (!l) return memHit(name, key);
  try {
    const { success } = await l.limit(key);
    return success;
  } catch (e) {
    // Awaria Redisa nie zatrzymuje studia — przechodzimy na licznik w pamięci.
    console.error("[limity] Redis niedostępny", (e as Error).message);
    return memHit(name, key);
  }
}
