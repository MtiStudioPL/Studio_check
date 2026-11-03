import { route } from "@/lib/guard";
import { adminList } from "@/lib/reservations";

export const dynamic = "force-dynamic";
export const GET = route({ admin: true, limits: ["admin"] }, () => adminList());
