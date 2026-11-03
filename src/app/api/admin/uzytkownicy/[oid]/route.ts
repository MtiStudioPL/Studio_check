import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { body, route, HttpError } from "@/lib/guard";
import { db, schema } from "@/db";
import { writeAudit } from "@/lib/audit";
import { enqueueMail, flushOutboxSoon } from "@/lib/mail";
import { mailDostepPrzyznany } from "@/lib/templates";

const B = z.discriminatedUnion("akcja", [
  z.object({ akcja: z.literal("akceptuj") }).strict(),
  z.object({ akcja: z.literal("odrzuc"), powod: z.string().trim().max(200).optional() }).strict(),
  z.object({ akcja: z.literal("zablokuj"), powod: z.string().trim().max(200).optional() }).strict(),
  z.object({ akcja: z.literal("odblokuj") }).strict(),
  z.object({ akcja: z.literal("rola"), rola: z.enum(["uzytkownik", "admin"]) }).strict(),
]);

function parseOid(raw: string) {
  const oid = decodeURIComponent(raw);
  if (!/^[0-9a-f-]{36}$/i.test(oid) && !/^dodany:[^\s@]+@[^\s@]+$/.test(oid)) throw new HttpError(400, "zle_oid", "Niepoprawny identyfikator.");
  return oid;
}

export const PATCH = route<{ oid: string }>({ admin: true, limits: ["admin"] }, async ({ req, user, ip, params }) => {
  const oid = parseOid(params.oid);
  const b = await body(req, B);
  const t = schema.uzytkownicy;
  if (oid === user.oid && b.akcja !== "akceptuj") throw new HttpError(400, "wlasne_konto", "Nie możesz zmienić własnego konta.");

  const u = await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(t).where(eq(t.oid, oid)).for("update");
    if (!cur) throw new HttpError(404, "nie_ma", "Nie ma takiej osoby.");
    let patch: Partial<typeof t.$inferInsert>;
    switch (b.akcja) {
      case "akceptuj":
        patch = { zaakceptowany: true, zaakceptowal: user.email, zaakceptowano: new Date(), zablokowany: false, powodBlokady: null };
        break;
      case "odrzuc":
        patch = { zablokowany: true, powodBlokady: b.powod || "nie zaakceptowano" };
        break;
      case "zablokuj":
        patch = { zablokowany: true, powodBlokady: b.powod || "zablokowane przez administratora" };
        break;
      case "odblokuj":
        patch = { zablokowany: false, powodBlokady: null };
        break;
      case "rola":
        if (b.rola === "admin" && !cur.zaakceptowany) patch = { rola: "admin", zaakceptowany: true, zaakceptowal: user.email, zaakceptowano: new Date() };
        else patch = { rola: b.rola };
        if (b.rola === "uzytkownik" && cur.rola === "admin") {
          const [{ n }] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(t)
            .where(and(eq(t.rola, "admin"), eq(t.zablokowany, false), ne(t.oid, oid)));
          if (n < 1) throw new HttpError(400, "ostatni_admin", "Musi zostać co najmniej jeden administrator.");
        }
        break;
    }
    const [u] = await tx.update(t).set(patch).where(eq(t.oid, oid)).returning();
    await writeAudit({ userOid: user.oid, zdarzenie: `admin_osoba_${b.akcja}`, obiekt: u.email, szczegoly: b, wynik: "ok", ip }, tx);
    // Mail tylko przy pierwszej akceptacji osoby, która już próbowała się zalogować.
    if (b.akcja === "akceptuj" && !cur.zaakceptowany && !oid.startsWith("dodany:")) {
      await enqueueMail({ to: u.email, ...mailDostepPrzyznany(u.imie.split(" ")[0] || u.imie), rodzaj: "dostep_przyznany" }, tx);
    }
    return u;
  });
  flushOutboxSoon();
  return { uzytkownik: { oid: u.oid, email: u.email, rola: u.rola, zaakceptowany: u.zaakceptowany, zablokowany: u.zablokowany } };
});

/** Usunięcie osoby dodanej ręcznie, która jeszcze się nie zalogowała. */
export const DELETE = route<{ oid: string }>({ admin: true, limits: ["admin"] }, async ({ user, ip, params }) => {
  const oid = parseOid(params.oid);
  if (!oid.startsWith("dodany:")) throw new HttpError(400, "nie_mozna", "Można usunąć tylko osobę, która jeszcze się nie logowała. Pozostałe zablokuj.");
  const [u] = await db.delete(schema.uzytkownicy).where(eq(schema.uzytkownicy.oid, oid)).returning();
  if (!u) throw new HttpError(404, "nie_ma", "Nie ma takiej osoby.");
  await writeAudit({ userOid: user.oid, zdarzenie: "admin_usuniecie_osoby", obiekt: u.email, wynik: "ok", ip });
  return { ok: true };
});
