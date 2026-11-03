import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { body, route, HttpError } from "@/lib/guard";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export const GET = route({ admin: true, limits: ["admin"] }, async () => {
  const t = schema.uzytkownicy;
  const rows = await db.select().from(t).orderBy(asc(t.zaakceptowany), desc(t.ostatnieLogowanie)).limit(1000);
  return {
    uzytkownicy: rows.map((u) => ({
      oid: u.oid,
      email: u.email,
      imie: u.imie,
      rola: u.rola,
      status: u.zablokowany ? "zablokowany" : !u.zaakceptowany ? "oczekuje" : "aktywny",
      powod: u.powodBlokady,
      dodanyRecznie: u.oid.startsWith("dodany:"),
      // Rola z Entra / ADMIN_EMAILS wraca przy każdym logowaniu — w panelu nie da się jej odebrać na stałe.
      adminZKonfiguracji: config.adminEmails.includes(u.email),
      dodal: u.dodal,
      zaakceptowal: u.zaakceptowal,
      zaakceptowano: u.zaakceptowano?.toISOString() ?? null,
      pierwsze: u.pierwszeLogowanie.toISOString(),
      ostatnie: u.ostatnieLogowanie?.toISOString() ?? null,
    })),
  };
});

const B = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    imie: z.string().trim().min(1).max(120),
    rola: z.enum(["uzytkownik", "admin"]).default("uzytkownik"),
  })
  .strict();

/** Dodanie osoby przed jej pierwszym logowaniem — konto od razu zaakceptowane, z wybraną rolą. */
export const POST = route({ admin: true, limits: ["admin"] }, async ({ req, user, ip }) => {
  const b = await body(req, B);
  if (!b.email.endsWith("@" + config.domain)) throw new HttpError(400, "zla_domena", `Tylko adresy @${config.domain}.`);
  const t = schema.uzytkownicy;
  const [ex] = await db.select().from(t).where(eq(t.email, b.email));
  if (ex) throw new HttpError(409, "istnieje", "Ta osoba jest już na liście — zmień jej rolę lub zaakceptuj ją tam.");
  const [u] = await db
    .insert(t)
    .values({ oid: `dodany:${b.email}`, email: b.email, imie: b.imie, rola: b.rola, zaakceptowany: true, zaakceptowal: user.email, zaakceptowano: new Date(), dodal: user.email, ostatnieLogowanie: null })
    .returning();
  await writeAudit({ userOid: user.oid, zdarzenie: "admin_dodanie_osoby", obiekt: b.email, szczegoly: { rola: b.rola }, wynik: "ok", ip });
  return { uzytkownik: { oid: u.oid, email: u.email, rola: u.rola } };
});
