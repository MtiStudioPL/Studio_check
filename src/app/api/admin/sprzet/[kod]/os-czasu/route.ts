import { route, HttpError } from "@/lib/guard";
import { equipmentTimeline } from "@/lib/admin";
import { parseKod } from "@/lib/qr";

export const dynamic = "force-dynamic";

export const GET = route<{ kod: string }>({ admin: true, limits: ["admin"] }, async ({ params }) => {
  const kod = parseKod(params.kod);
  if (!kod) throw new HttpError(400, "zly_kod", "Niepoprawny kod.");
  return equipmentTimeline(kod);
});
