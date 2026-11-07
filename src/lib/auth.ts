import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "./config";
import { writeAudit } from "./audit";
import { checkClaims, emailFromClaims } from "./claims";
import { readTicket } from "./logintoken";

export { checkClaims, emailFromClaims };

declare module "next-auth" {
  interface Session {
    user: { oid: string; email: string; name: string; admin: boolean };
  }
}

const secure = (process.env.AUTH_URL ?? process.env.APP_URL ?? "").startsWith("https://");

/**
 * Logowanie: jednorazowy kod wysłany na szkolny adres e-mail (zob. lib/logincode.ts, app/actions.ts).
 * Kod i zapis osoby sprawdza akcja serwera; do Auth.js trafia podpisany, krótko żyjący bilet —
 * tu zostaje tylko jego weryfikacja i utworzenie sesji.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/login", error: "/odmowa" },
  cookies: {
    sessionToken: {
      // __Host- wymaga Secure, ścieżki / i braku domeny — działa tylko po HTTPS.
      name: secure ? "__Host-studio.session" : "studio.session",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure },
    },
  },
  providers: [
    Credentials({
      id: "kod-mailowy",
      name: "Kod z maila",
      credentials: { ticket: {} },
      async authorize(c) {
        const p = readTicket(config.authSecret, String(c?.ticket ?? ""));
        return p ? { id: p.oid, email: p.email, name: p.name } : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const email = String(user.email ?? "");
        token.oid = user.id;
        token.email = email;
        token.name = user.name ?? email;
        token.admin = isAdmin(undefined, email);
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        oid: String(token.oid ?? ""),
        email: String(token.email ?? ""),
        name: String(token.name ?? ""),
        admin: Boolean(token.admin),
      } as typeof session.user & { id: string; emailVerified: null };
      return session;
    },
  },
  events: {
    async signOut(msg) {
      const oid = "token" in msg && msg.token ? String(msg.token.oid ?? "") : "";
      if (oid) await writeAudit({ userOid: oid, zdarzenie: "wylogowanie", wynik: "ok" });
    },
  },
});

export function isAdmin(roles: string[] | undefined, email: string): boolean {
  return (roles ?? []).includes("Studio.Admin") || config.adminEmails.includes(email);
}

/** Aktualny stan konta z bazy (blokada działa natychmiast, bez czekania na wygaśnięcie sesji). */
export async function loadUser(oid: string) {
  const [u] = await db.select().from(schema.uzytkownicy).where(eq(schema.uzytkownicy.oid, oid));
  return u ?? null;
}
