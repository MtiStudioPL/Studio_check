import { z } from "zod";
import { body, route } from "@/lib/guard";
import { db } from "@/db";
import { checkinInQuiet, getCisza, inventoryAdminOnly, setSetting } from "@/lib/settings";
import { config } from "@/lib/config";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const B = z
  .object({
    cisza: z.object({ od: hhmm, do: hhmm }).strict().optional(),
    inwentaryzacjaTylkoAdmin: z.boolean().optional(),
    checkinWCiszy: z.enum(["odrzucaj", "pozwalaj"]).optional(),
  })
  .strict();

async function current() {
  return {
    cisza: await getCisza(),
    inwentaryzacjaTylkoAdmin: await inventoryAdminOnly(),
    checkinWCiszy: await checkinInQuiet(),
    administratorzy: config.adminEmails,
    powiadomienia: config.adminNotify,
  };
}

export const GET = route({ admin: true, limits: ["admin"] }, () => current());

export const PATCH = route({ admin: true, limits: ["admin"] }, async ({ req, user, ip }) => {
  const b = await body(req, B);
  await db.transaction(async (tx) => {
    if (b.cisza) await setSetting("cisza", b.cisza, tx);
    if (b.inwentaryzacjaTylkoAdmin !== undefined) await setSetting("inwentaryzacja_tylko_admin", b.inwentaryzacjaTylkoAdmin, tx);
    if (b.checkinWCiszy) await setSetting("checkin_w_ciszy", b.checkinWCiszy, tx);
    await writeAudit({ userOid: user.oid, zdarzenie: "admin_ustawienia", szczegoly: b, wynik: "ok", ip }, tx);
  });
  return current();
});
