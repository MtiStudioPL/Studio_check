import { route } from "@/lib/guard";
import { dashboard } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const GET = route({ admin: true, limits: ["admin"] }, () => dashboard());
