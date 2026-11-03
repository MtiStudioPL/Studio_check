import { route } from "@/lib/guard";
import { whoIsIn } from "@/lib/attendance";

export const dynamic = "force-dynamic";
export const GET = route({ limits: ["odczyt"] }, async () => ({ osoby: await whoIsIn() }));
