import { route, HttpError } from "@/lib/guard";
import { startInventory } from "@/lib/equipment";
import { inventoryAdminOnly } from "@/lib/settings";
import { hit } from "@/lib/ratelimit";

export const POST = route({}, async ({ user }) => {
  if ((await inventoryAdminOnly()) && !user.admin) throw new HttpError(403, "brak_uprawnien", "Inwentaryzację rozpoczyna administrator.");
  if (!(await hit("inwentaryzacja", "studio:start"))) throw new HttpError(429, "limit", "Inwentaryzację można rozpocząć raz na 10 minut.");
  return startInventory(user);
});
