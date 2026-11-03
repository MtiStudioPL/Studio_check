import { route, HttpError } from "@/lib/guard";
import { cancelReservation } from "@/lib/reservations";
import { flushOutboxSoon } from "@/lib/mail";

export const POST = route<{ id: string }>({ limits: ["odczyt"] }, async ({ user, params }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "zle_id", "Niepoprawny numer.");
  const r = await cancelReservation(user, id);
  flushOutboxSoon();
  return r;
});
