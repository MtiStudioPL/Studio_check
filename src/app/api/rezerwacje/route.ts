import { z } from "zod";
import { body, route } from "@/lib/guard";
import { createRequest, myReservations } from "@/lib/reservations";
import { flushOutboxSoon } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const GET = route({ limits: ["odczyt"] }, async ({ user }) => ({ rezerwacje: await myReservations(user.oid) }));

const B = z
  .object({
    od: z.string().datetime({ offset: true }),
    do: z.string().datetime({ offset: true }),
    kody: z.array(z.number().int().min(1)).min(1).max(15),
    cel: z.string().trim().max(500).nullish(),
  })
  .strict();

export const POST = route({ botid: true, limits: ["rezerwacja"] }, async ({ req, user }) => {
  const b = await body(req, B);
  const r = await createRequest(user, { od: new Date(b.od), do: new Date(b.do), kody: b.kody, cel: b.cel });
  flushOutboxSoon();
  return r;
});
