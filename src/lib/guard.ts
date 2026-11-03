import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { isBot } from "./botid";
import { auth, loadUser } from "./auth";
import { clientIp, writeAudit } from "./audit";
import { hit, type RuleName } from "./ratelimit";
import { config } from "./config";

import { HttpError, type User } from "./errors";

export { HttpError, type User };
export type Ctx<P> = { req: Request; user: User; ip: string | null; params: P };

type Opts = {
  /** Tylko rola Studio.Admin */
  admin?: boolean;
  /** Weryfikacja BotID przed zapisem */
  botid?: boolean;
  /** Limity na osobę, sprawdzane po kolei */
  limits?: RuleName[];
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** CSRF: zapytania zmieniające stan tylko z własnej domeny. */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  try {
    const o = new URL(origin);
    const self = new URL(req.url);
    const app = new URL(config.appUrl);
    return o.host === self.host || o.host === app.host;
  } catch {
    return false;
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Każdy endpoint z danymi przechodzi przez tę funkcję:
 * CSRF → BotID → sesja → blokada konta → rola → limity → handler → bezpieczna obsługa błędów.
 */
export function route<P = Record<string, never>>(opts: Opts, handler: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: Request, segment?: { params?: Promise<P> }) => {
    const ip = clientIp(req);
    let oid: string | null = null;
    try {
      if (MUTATING.has(req.method) && !sameOrigin(req)) {
        await writeAudit({ zdarzenie: "csrf", obiekt: new URL(req.url).pathname, wynik: "odmowa", ip });
        throw new HttpError(403, "obca_domena", "Zapytanie spoza aplikacji.");
      }
      if (opts.botid) {
        if (await isBot()) {
          await writeAudit({ zdarzenie: "botid", obiekt: new URL(req.url).pathname, wynik: "odmowa", ip });
          throw new HttpError(403, "bot", "Odmowa dostępu.");
        }
      }
      const session = await auth();
      if (!session?.user?.oid) throw new HttpError(401, "brak_sesji", "Zaloguj się kontem szkolnym.");
      oid = session.user.oid;
      const u = await loadUser(oid);
      if (!u) throw new HttpError(401, "brak_sesji", "Zaloguj się ponownie.");
      if (u.zablokowany) throw new HttpError(403, "zablokowany", "Konto jest zablokowane. Skontaktuj się z administratorem studia.");
      if (!u.zaakceptowany) throw new HttpError(403, "oczekuje", "Konto czeka na akceptację administratora studia.");
      const user: User = { oid, email: u.email, name: u.imie || u.email, admin: u.rola === "admin" };
      if (opts.admin && !user.admin) {
        await writeAudit({ userOid: oid, zdarzenie: "brak_uprawnien", obiekt: new URL(req.url).pathname, wynik: "odmowa", ip });
        throw new HttpError(403, "brak_uprawnien", "Tylko administrator studia.");
      }
      for (const rule of opts.limits ?? []) {
        if (!(await hit(rule, oid))) {
          await writeAudit({ userOid: oid, zdarzenie: "limit", obiekt: rule, wynik: "limit", ip });
          throw new HttpError(429, "limit", "Za dużo zapytań. Spróbuj za chwilę.");
        }
      }
      const params = ((await segment?.params) ?? {}) as P;
      const out = await handler({ req, user, ip, params });
      return out instanceof Response ? out : json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...e.extra }, e.status);
  if (e instanceof ZodError) return json({ error: "walidacja", message: "Niepoprawne dane.", pola: e.issues.map((i) => i.path.join(".")) }, 400);
  console.error("[api]", e);
  return json({ error: "blad_serwera", message: "Coś poszło nie tak. Spróbuj ponownie." }, 500);
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 10_000) throw new HttpError(413, "za_duze");
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "zly_json", "Niepoprawne dane.");
  }
  return schema.parse(raw);
}

/** Endpointy crona: tylko z nagłówkiem Authorization: Bearer CRON_SECRET (porównanie w stałym czasie). */
export function cronRoute(handler: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    const { timingSafeEqual } = await import("node:crypto");
    const secret = config.cronSecret;
    const got = req.headers.get("authorization") ?? "";
    const want = `Bearer ${secret}`;
    const ok = secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!ok) return json({ error: "brak_sesji" }, 401);
    try {
      return json(await handler(req));
    } catch (e) {
      return errorResponse(e);
    }
  };
}
