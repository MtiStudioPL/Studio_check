import { z } from "zod";
import { body, route, HttpError } from "@/lib/guard";
import { remindPerson } from "@/lib/equipment";
import { hit } from "@/lib/ratelimit";
import { flushOutboxSoon } from "@/lib/mail";

const B = z.object({ email: z.string().email().max(200).transform((s) => s.toLowerCase()) }).strict();

export const POST = route({ limits: ["przypomnij_dzien"] }, async ({ req, user }) => {
  const { email } = await body(req, B);
  if (!(await hit("przypomnij_adresat", email))) throw new HttpError(429, "limit", "Ta osoba dostała przypomnienie w ciągu ostatnich 30 minut.");
  const r = await remindPerson(user, email);
  flushOutboxSoon();
  return r;
});
