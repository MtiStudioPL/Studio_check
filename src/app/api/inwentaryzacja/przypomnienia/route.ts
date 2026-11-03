import { route, HttpError } from "@/lib/guard";
import { sendShortageReminders } from "@/lib/equipment";
import { inventoryAdminOnly } from "@/lib/settings";
import { hit } from "@/lib/ratelimit";
import { flushOutboxSoon } from "@/lib/mail";

export const POST = route({}, async ({ user }) => {
  if ((await inventoryAdminOnly()) && !user.admin) throw new HttpError(403, "brak_uprawnien", "Maile o brakach wysyła administrator.");
  if (!(await hit("inwentaryzacja", "studio:braki"))) throw new HttpError(429, "limit", "Maile o brakach można wysłać raz na 10 minut.");
  const r = await sendShortageReminders(user);
  flushOutboxSoon();
  return r;
});
