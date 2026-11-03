import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { db, schema } from "@/db";
import { view } from "@/lib/equipment";
import { writeAudit } from "@/lib/audit";

const B = z
  .object({
    kod: z.number().int().min(1).max(999_999),
    nazwa: z.string().trim().min(1).max(120),
    kategoria: z.string().trim().max(60).default(""),
    maQr: z.boolean().optional(),
  })
  .strict();

export const POST = route({ admin: true, limits: ["admin"] }, async ({ req, user, ip }) => {
  const b = await body(req, B);
  const [s] = await db
    .insert(schema.sprzet)
    .values({ kod: b.kod, nazwa: b.nazwa, kategoria: b.kategoria, maQr: b.maQr ?? b.kod < 101 })
    .onConflictDoNothing({ target: schema.sprzet.kod })
    .returning();
  if (!s) throw new HttpError(409, "kod_zajety", `Kod ${b.kod} jest już używany.`);
  await writeAudit({ userOid: user.oid, zdarzenie: "admin_sprzet_dodaj", obiekt: String(b.kod), szczegoly: { nazwa: b.nazwa }, wynik: "ok", ip });
  return { pozycja: view(s) };
});
