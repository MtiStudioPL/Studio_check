import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { enqueueAdmin, flushOutboxSoon } from "./mail";
import { mailNowaOsoba } from "./templates";

/** Czy konto z tym adresem już istnieje (także dodane wcześniej przez administratora). */
export async function userExists(email: string): Promise<boolean> {
  const [r] = await db.select({ oid: schema.uzytkownicy.oid }).from(schema.uzytkownicy).where(eq(schema.uzytkownicy.email, email)).limit(1);
  return !!r;
}

/**
 * Zapis użytkownika przy logowaniu.
 *  - nowa osoba: konto czeka na akceptację (mail do administratorów),
 *  - osoba dodana wcześniej przez administratora (oid „dodany:<email>”): przejmuje prawdziwy oid, od razu aktywna,
 *  - rola admin z Entra (Studio.Admin) albo ADMIN_EMAILS: zawsze aktywna; rola nadana w aplikacji nie jest odbierana przy logowaniu.
 */
export async function upsertOnLogin(oid: string, email: string, imie: string, adminByConfig: boolean) {
  const t = schema.uzytkownicy;
  const { u, nowy } = await db.transaction(async (tx) => {
    let [ex] = await tx.select().from(t).where(eq(t.oid, oid)).for("update");
    if (!ex) [ex] = await tx.select().from(t).where(eq(t.email, email)).for("update");
    if (ex) {
      const [u] = await tx
        .update(t)
        .set({
          oid,
          email,
          imie,
          rola: adminByConfig ? "admin" : ex.rola,
          zaakceptowany: ex.zaakceptowany || adminByConfig,
          zaakceptowano: ex.zaakceptowano ?? (adminByConfig ? new Date() : null),
          zaakceptowal: ex.zaakceptowal ?? (adminByConfig ? "konfiguracja" : null),
          ostatnieLogowanie: sql`now()`,
        })
        .where(eq(t.oid, ex.oid))
        .returning();
      return { u, nowy: false };
    }
    const [u] = await tx
      .insert(t)
      .values({
        oid, email, imie,
        rola: adminByConfig ? "admin" : "uzytkownik",
        zaakceptowany: adminByConfig,
        zaakceptowano: adminByConfig ? new Date() : null,
        zaakceptowal: adminByConfig ? "konfiguracja" : null,
        ostatnieLogowanie: sql`now()`,
      })
      .returning();
    if (!adminByConfig) await enqueueAdmin({ ...mailNowaOsoba({ imie, email }), rodzaj: "nowa_osoba" }, tx);
    return { u, nowy: true };
  });
  if (nowy && !u.zaakceptowany) {
    try {
      flushOutboxSoon();
    } catch {
      /* poza kontekstem żądania — wyśle cron */
    }
  }
  return u;
}

