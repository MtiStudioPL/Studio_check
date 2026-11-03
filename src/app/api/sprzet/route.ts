import { z } from "zod";
import { route } from "@/lib/guard";
import { listEquipment } from "@/lib/equipment";

export const dynamic = "force-dynamic";

const Q = z.object({
  filtr: z.enum(["wszystko", "brakuje", "bezqr", "wypozyczone"]).default("wszystko"),
  q: z.string().max(100).optional(),
});

export const GET = route({ limits: ["odczyt"] }, async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const { filtr, q } = Q.parse({ filtr: sp.get("filtr") ?? undefined, q: sp.get("q") ?? undefined });
  return listEquipment(filtr, q);
});
