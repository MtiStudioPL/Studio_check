import { route, HttpError } from "@/lib/guard";
import { getByKod } from "@/lib/equipment";
import { parseKod } from "@/lib/qr";

export const dynamic = "force-dynamic";

export const GET = route<{ kod: string }>({ limits: ["odczyt"] }, async ({ params }) => {
  const kod = parseKod(params.kod);
  if (!kod) throw new HttpError(400, "zly_kod", "Niepoprawny kod.");
  const p = await getByKod(kod);
  if (!p) throw new HttpError(404, "nie_ma", "Nie ma sprzętu o tym kodzie.");
  return { pozycja: p };
});
