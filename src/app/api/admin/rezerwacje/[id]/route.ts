import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { decide } from "@/lib/reservations";
import { flushOutboxSoon } from "@/lib/mail";

const B = z.object({ decyzja: z.enum(["zatwierdz", "odrzuc"]), powod: z.string().trim().max(300).nullish() }).strict();

export const POST = route<{ id: string }>({ admin: true, limits: ["admin"] }, async ({ req, user, params }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "zle_id", "Niepoprawny numer.");
  const b = await body(req, B);
  const r = await decide(user, id, b.decyzja, b.powod);
  flushOutboxSoon();
  return { rezerwacja: r };
});
