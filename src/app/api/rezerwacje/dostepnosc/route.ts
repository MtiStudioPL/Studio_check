import { z } from "zod";
import { route, HttpError } from "@/lib/guard";
import { availability } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const Q = z.object({ od: z.string().datetime({ offset: true }), do: z.string().datetime({ offset: true }) });

export const GET = route({ limits: ["odczyt"] }, async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  const q = Q.parse({ od: sp.get("od"), do: sp.get("do") });
  const od = new Date(q.od), doo = new Date(q.do);
  if (doo <= od) throw new HttpError(400, "zla_data", "Koniec musi być po początku.");
  if (doo.getTime() - od.getTime() > 14 * 86_400_000) throw new HttpError(400, "za_dlugo", "Najwyżej 14 dni.");
  return { dostepnosc: await availability(od, doo, { dla: user.email }) };
});
