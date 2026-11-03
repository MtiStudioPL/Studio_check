import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { adminCloseVisit } from "@/lib/attendance";

const B = z.object({ powod: z.string().trim().min(1).max(200) }).strict();

export const POST = route<{ id: string }>({ admin: true, limits: ["admin"] }, async ({ req, user, ip, params }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "zle_id", "Niepoprawny numer wizyty.");
  const { powod } = await body(req, B);
  return { wizyta: await adminCloseVisit(user, id, powod, ip) };
});
