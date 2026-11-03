import { route } from "@/lib/guard";
import { config } from "@/lib/config";
import { getDoorVersion } from "@/lib/settings";
import { makeStaticToken } from "@/lib/doorToken";

export const dynamic = "force-dynamic";

export const GET = route({ admin: true, limits: ["admin"] }, async () => {
  const wersja = await getDoorVersion();
  return { wersja, link: `${config.appUrl}/c?t=${makeStaticToken(config.doorSecret, wersja)}` };
});
