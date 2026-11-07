"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isBot } from "@/lib/botid";
import { isAdmin, signIn, signOut } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { config } from "@/lib/config";
import { hit } from "@/lib/ratelimit";
import { requestLoginCode, savedName, verifyLoginCode } from "@/lib/logincode";
import { emailInDomain, makeTicket, nameFromEmail, normalizeEmail } from "@/lib/logintoken";
import { upsertOnLogin } from "@/lib/users";

/** Tylko ścieżki wewnątrz aplikacji — bez otwartego przekierowania. */
function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") && !s.startsWith("/api/") ? s : "/";
}

async function ipFromHeaders(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export type LoginState = { krok: "email" | "kod"; email?: string; blad?: string };

/** Krok 1: adres e-mail → kod na skrzynkę szkolną. */
export async function poprosOKodAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ip = await ipFromHeaders();
  if (await isBot()) {
    await writeAudit({ zdarzenie: "botid", obiekt: "/login", wynik: "odmowa", ip });
    return { krok: "email", blad: "Odmowa dostępu." };
  }
  const email = normalizeEmail(form.get("email"));
  if (!emailInDomain(email, config.domain)) {
    await writeAudit({ zdarzenie: "logowanie", obiekt: email || null, wynik: "odmowa", szczegoly: { powod: "zla_domena" }, ip });
    return { krok: "email", email, blad: `Podaj szkolny adres e-mail (@${config.domain}).` };
  }
  const imie = String(form.get("imie") ?? "").trim().slice(0, 80);
  if ((await requestLoginCode(email, imie, ip)) === "limit") {
    await writeAudit({ zdarzenie: "kod_limit", obiekt: email, wynik: "limit", ip });
    return { krok: "email", email, blad: "Za dużo prób. Spróbuj za kilka minut." };
  }
  await writeAudit({ zdarzenie: "kod_wyslany", obiekt: email, wynik: "ok", ip });
  return { krok: "kod", email };
}

/** Krok 2: kod z maila → sesja (albo „czeka na akceptację” / blokada). */
export async function zalogujKodemAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const ip = await ipFromHeaders();
  const email = normalizeEmail(form.get("email"));
  const kod = String(form.get("kod") ?? "").replace(/\D/g, "");
  const wroc = (blad: string): LoginState => ({ krok: "kod", email, blad });

  if (await isBot()) {
    await writeAudit({ zdarzenie: "botid", obiekt: "/login", wynik: "odmowa", ip });
    return wroc("Odmowa dostępu.");
  }
  if (!emailInDomain(email, config.domain)) return { krok: "email", blad: `Podaj szkolny adres e-mail (@${config.domain}).` };
  if (!(await hit("kod_weryfikacja_ip", ip ?? "brak"))) {
    await writeAudit({ zdarzenie: "kod_limit", obiekt: email, wynik: "limit", ip });
    return wroc("Za dużo prób. Spróbuj za kilka minut.");
  }

  const v = await verifyLoginCode(email, kod);
  if (!v.ok) {
    await writeAudit({ zdarzenie: "logowanie", obiekt: email, wynik: "odmowa", szczegoly: { powod: v.powod }, ip });
    return wroc(v.powod === "wygasl" ? "Kod wygasł albo został zużyty. Wyślij nowy." : "Niepoprawny kod.");
  }

  const oid = `mail:${email}`;
  const imie = v.imie || (await savedName(email)) || nameFromEmail(email);
  const u = await upsertOnLogin(oid, email, imie, isAdmin(undefined, email));
  if (u.zablokowany) {
    await writeAudit({ userOid: u.oid, zdarzenie: "logowanie", wynik: "odmowa", szczegoly: { powod: "zablokowany" }, ip });
    redirect("/odmowa?powod=blokada");
  }
  await writeAudit({ userOid: u.oid, zdarzenie: "logowanie", wynik: "ok", szczegoly: u.zaakceptowany ? null : { oczekuje: true }, ip });
  // Bez akceptacji administratora sesja nie powstaje.
  if (!u.zaakceptowany) redirect("/oczekuje");

  await signIn("kod-mailowy", { ticket: makeTicket(config.authSecret, { oid: u.oid, email, name: u.imie || imie }), redirectTo: safeNext(form.get("next")) });
  return wroc("Nie udało się zalogować. Spróbuj ponownie.");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login?wylogowano=1" });
}
