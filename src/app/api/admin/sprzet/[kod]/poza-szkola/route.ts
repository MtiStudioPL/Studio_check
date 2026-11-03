import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { markOutOfSchool } from "@/lib/equipment";
import { parseKod } from "@/lib/qr";

const B = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    miejsce: z.string().trim().min(1).max(100),
    planowanyZwrot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    uwagi: z.string().trim().max(300).nullish(),
  })
  .strict();

export const POST = route<{ kod: string }>({ admin: true, limits: ["admin"] }, async ({ req, user, params }) => {
  const kod = parseKod(params.kod);
  if (!kod) throw new HttpError(400, "zly_kod", "Niepoprawny kod.");
  const b = await body(req, B);
  return { pozycja: await markOutOfSchool(user, kod, b) };
});
