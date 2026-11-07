import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "./config";
import { enqueueMail, flushOutboxSoon } from "./mail";
import { hit } from "./ratelimit";
import { mailKodLogowania } from "./templates";
import { CODE_MAX_TRIES, CODE_TTL_MIN, codeMatches, hashCode, newCode } from "./logintoken";

const t = schema.kodyLogowania;

/** Tworzy kod (zastępuje poprzedni dla tego adresu) i wrzuca mail do kolejki. */
export async function requestLoginCode(email: string, imie: string, ip: string | null): Promise<"ok" | "limit"> {
  if (!(await hit("kod_email", email)) || !(await hit("kod_ip", ip ?? "brak"))) return "limit";
  const kod = newCode();
  const values = {
    kodHash: hashCode(config.authSecret, email, kod),
    imie,
    wygasa: sql`now() + make_interval(mins => ${CODE_TTL_MIN})`,
    proby: 0,
    utworzono: sql`now()`,
  };
  await db.transaction(async (tx) => {
    await tx.insert(t).values({ email, ...values }).onConflictDoUpdate({ target: t.email, set: values });
    await enqueueMail({ to: email, ...mailKodLogowania(kod, CODE_TTL_MIN), rodzaj: "kod" }, tx);
  });
  if (process.env.NODE_ENV !== "production" && config.mailDisabled) console.log(`[kod logowania] ${email}: ${kod}`);
  try {
    flushOutboxSoon();
  } catch {
    /* poza kontekstem żądania — wyśle cron */
  }
  return "ok";
}

export type VerifyResult = { ok: true; imie: string } | { ok: false; powod: "zly" | "wygasl" };

/** Sprawdza kod. Poprawny kod zużywa się od razu; po zbyt wielu błędach kod przepada. */
export async function verifyLoginCode(email: string, kod: string): Promise<VerifyResult> {
  return db.transaction(async (tx): Promise<VerifyResult> => {
    const [r] = await tx
      .select({ kodHash: t.kodHash, imie: t.imie, proby: t.proby, wazny: sql<boolean>`${t.wygasa} > now()` })
      .from(t)
      .where(eq(t.email, email))
      .for("update");
    if (!r) return { ok: false, powod: "wygasl" };
    if (!r.wazny) {
      await tx.delete(t).where(eq(t.email, email));
      return { ok: false, powod: "wygasl" };
    }
    if (!codeMatches(config.authSecret, email, kod, r.kodHash)) {
      if (r.proby + 1 >= CODE_MAX_TRIES) await tx.delete(t).where(eq(t.email, email));
      else await tx.update(t).set({ proby: r.proby + 1 }).where(eq(t.email, email));
      return { ok: false, powod: "zly" };
    }
    await tx.delete(t).where(eq(t.email, email));
    return { ok: true, imie: r.imie };
  });
}

/** Imię zapisane wcześniej dla adresu (np. dodane przez administratora). */
export async function savedName(email: string): Promise<string> {
  const [u] = await db.select({ imie: schema.uzytkownicy.imie }).from(schema.uzytkownicy).where(eq(schema.uzytkownicy.email, email));
  return u?.imie ?? "";
}
