import { route } from "@/lib/guard";
import { config } from "@/lib/config";
import { getDoorVersion } from "@/lib/settings";
import { makeKioskToken } from "@/lib/doorToken";

export const dynamic = "force-dynamic";

// Tablet-kiosk (etap 2): zalogowany administrator, kod zmienia się co 30 s.
export const GET = route({ admin: true }, async () => {
  const wersja = await getDoorVersion();
  return { link: `${config.appUrl}/c?t=${makeKioskToken(config.doorSecret, wersja)}`, odswiezZa: 30 - (Math.floor(Date.now() / 1000) % 30) };
});
