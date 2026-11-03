import { z } from "zod";
import { eq } from "drizzle-orm";
import { body, route, HttpError } from "@/lib/guard";
import { db, schema } from "@/db";
import { view } from "@/lib/equipment";
import { parseKod } from "@/lib/qr";
import { writeAudit } from "@/lib/audit";

const B = z
  .object({
    nazwa: z.string().trim().min(1).max(120).optional(),
    kategoria: z.string().trim().max(60).optional(),
    maQr: z.boolean().optional(),
  })
  .strict();

export const PATCH = route<{ kod: string }>({ admin: true, limits: ["admin"] }, async ({ req, user, ip, params }) => {
  const kod = parseKod(params.kod);
  if (!kod) throw new HttpError(400, "zly_kod", "Niepoprawny kod.");
  const b = await body(req, B);
  if (!Object.keys(b).length) throw new HttpError(400, "brak_zmian", "Nic do zmiany.");
  const [s] = await db.update(schema.sprzet).set({ ...b, zaktualizowano: new Date() }).where(eq(schema.sprzet.kod, kod)).returning();
  if (!s) throw new HttpError(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
  await writeAudit({ userOid: user.oid, zdarzenie: "admin_sprzet_zmien", obiekt: String(kod), szczegoly: b, wynik: "ok", ip });
  return { pozycja: view(s) };
});
