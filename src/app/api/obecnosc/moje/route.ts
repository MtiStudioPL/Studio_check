import { route } from "@/lib/guard";
import { myVisits } from "@/lib/attendance";

export const dynamic = "force-dynamic";
export const GET = route({ limits: ["odczyt"] }, async ({ user }) => ({ wizyty: await myVisits(user.oid) }));
