import { cronRoute } from "@/lib/guard";
import { tick } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron wysyła GET z nagłówkiem Authorization: Bearer CRON_SECRET; zewnętrzny harmonogram — POST.
const handler = cronRoute(() => tick());
export const GET = handler;
export const POST = handler;
