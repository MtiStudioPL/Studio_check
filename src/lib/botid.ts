import "server-only";
import { checkBotId } from "botid/server";

/**
 * Weryfikacja BotID. Działa na Vercelu (wymaga nagłówków dodawanych przez platformę).
 * Lokalnie (`next dev` / `next start` poza Vercelem) jest pomijana.
 * Na Vercelu błąd konfiguracji traktujemy jak bota (fail closed); BOTID_DISABLED=1 to awaryjny wyłącznik.
 */
export async function isBot(): Promise<boolean> {
  if (process.env.BOTID_DISABLED === "1") return false;
  if (!process.env.VERCEL) return false;
  try {
    const v = await checkBotId();
    return v.isBot;
  } catch (e) {
    console.error("[botid]", (e as Error).message);
    return true;
  }
}
