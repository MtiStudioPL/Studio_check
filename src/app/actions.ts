"use server";

import { isBot } from "@/lib/botid";
import { signIn, signOut } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

/** Tylko ścieżki wewnątrz aplikacji — bez otwartego przekierowania. */
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !s.startsWith("/api/") ? s : "/";
}

export async function loginAction(form: FormData) {
  if (await isBot()) {
    await writeAudit({ zdarzenie: "botid", obiekt: "/login", wynik: "odmowa" });
    throw new Error("Odmowa dostępu.");
  }
  await signIn("microsoft-entra-id", { redirectTo: safeNext(form.get("next")) });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login?wylogowano=1" });
}
