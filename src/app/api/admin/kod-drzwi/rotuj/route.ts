import { route } from "@/lib/guard";
import { db } from "@/db";
import { config } from "@/lib/config";
import { getDoorVersion, setSetting } from "@/lib/settings";
import { makeStaticToken } from "@/lib/doorToken";
import { writeAudit } from "@/lib/audit";

export const POST = route({ admin: true, limits: ["admin"] }, async ({ user, ip }) => {
  const wersja = await db.transaction(async (tx) => {
    const v = (await getDoorVersion()) + 1;
    await setSetting("kod_drzwi_wersja", v, tx);
    await writeAudit({ userOid: user.oid, zdarzenie: "admin_rotacja_kodu_drzwi", szczegoly: { wersja: v }, wynik: "ok", ip }, tx);
    return v;
  });
  return { wersja, link: `${config.appUrl}/c?t=${makeStaticToken(config.doorSecret, wersja)}` };
});
