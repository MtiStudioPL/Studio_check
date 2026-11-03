import { z } from "zod";
import { body, route } from "@/lib/guard";
import { checkIn } from "@/lib/attendance";
import { flushOutboxSoon } from "@/lib/mail";

const B = z.object({ token: z.string().min(5).max(80) }).strict();

export const POST = route({ botid: true, limits: ["obecnosc"] }, async ({ req, user, ip }) => {
  const { token } = await body(req, B);
  const r = await checkIn(user, token, ip);
  flushOutboxSoon();
  return r;
});
