import { z } from "zod";
import { body, route } from "@/lib/guard";
import { performAction } from "@/lib/equipment";
import { flushOutboxSoon } from "@/lib/mail";

const B = z
  .object({
    kod: z.number().int().min(1).max(999_999_999),
    akcja: z.enum(["biore", "oddaje", "sprawdzam"]),
    uwagi: z.string().max(500).nullish(),
    request_id: z.string().uuid(),
    zrodlo: z.enum(["aplikacja", "skaner", "link_qr", "start"]).optional(),
  })
  .strict();

export const POST = route({ botid: true, limits: ["akcja_min", "akcja_dzien"] }, async ({ req, user }) => {
  const b = await body(req, B);
  const r = await performAction(user, { kod: b.kod, akcja: b.akcja, uwagi: b.uwagi, requestId: b.request_id }, b.zrodlo ?? "aplikacja");
  flushOutboxSoon();
  return r;
});
