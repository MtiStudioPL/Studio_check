import { z } from "zod";
import { body, route } from "@/lib/guard";
import { checkOut } from "@/lib/attendance";

const B = z.object({ potwierdzam: z.boolean().default(false), zrodlo: z.enum(["aplikacja", "kod_drzwi"]).default("aplikacja") }).strict();

// Właściciel wizyty: checkOut zawsze działa na wizycie osoby z sesji, nigdy na id z zapytania.
export const POST = route({ botid: true, limits: ["obecnosc"] }, async ({ req, user }) => {
  const b = await body(req, B);
  return checkOut(user, b.potwierdzam, b.zrodlo);
});
