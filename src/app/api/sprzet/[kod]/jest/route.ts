import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { setJest } from "@/lib/equipment";
import { parseKod } from "@/lib/qr";

const B = z.object({ jest: z.boolean() }).strict();

export const PATCH = route<{ kod: string }>({ admin: true, limits: ["odhacz"] }, async ({ req, user, params }) => {
  const kod = parseKod(params.kod);
  if (!kod) throw new HttpError(400, "zly_kod", "Niepoprawny kod.");
  const { jest } = await body(req, B);
  return { pozycja: await setJest(user, kod, jest) };
});
