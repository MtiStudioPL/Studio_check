import { route, HttpError } from "@/lib/guard";
import { startInventory } from "@/lib/equipment";
import { hit } from "@/lib/ratelimit";

export const POST = route({ admin: true }, async ({ user }) => {
  if (!(await hit("inwentaryzacja", "studio:start"))) throw new HttpError(429, "limit", "Inwentaryzację można rozpocząć raz na 10 minut.");
  return startInventory(user);
});
