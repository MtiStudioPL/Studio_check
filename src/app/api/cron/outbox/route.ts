import { cronRoute } from "@/lib/guard";
import { processOutbox } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = cronRoute(() => processOutbox(50));
export const GET = handler;
export const POST = handler;
