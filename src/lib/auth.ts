import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "./config";
import { writeAudit } from "./audit";
import { upsertOnLogin } from "./users";
import { checkClaims, emailFromClaims, type Claims } from "./claims";

export { checkClaims, emailFromClaims };

declare module "next-auth" {
  interface Session {
    user: { oid: string; email: string; name: string; admin: boolean };
  }
}

const secure = (process.env.AUTH_URL ?? process.env.APP_URL ?? "").startsWith("https://");

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
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: { params: { scope: "openid profile email User.Read", prompt: "select_account" } },
      // Bez pobierania zdjęcia z Graph — mniejsza sesja, mniej uprawnień w użyciu.
      profile(p) {
        return { id: p.oid ?? p.sub, name: p.name, email: emailFromClaims(p as Claims) };
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const c = (profile ?? {}) as Claims;
      const check = checkClaims(c, config.tenantId, config.domain);
      if (!check.ok) {
        await writeAudit({ zdarzenie: "logowanie", wynik: "odmowa", obiekt: emailFromClaims(c) || null, szczegoly: { powod: check.reason } });
        return "/odmowa?powod=domena";
      }
      const email = emailFromClaims(c);
      const u = await upsertOnLogin(c.oid!, email, c.name ?? email, isAdmin(c.roles, email));
      if (u.zablokowany) {
        await writeAudit({ userOid: c.oid, zdarzenie: "logowanie", wynik: "odmowa", szczegoly: { powod: "zablokowany" } });
        return "/odmowa?powod=blokada";
      }
      await writeAudit({ userOid: c.oid, zdarzenie: "logowanie", wynik: "ok", szczegoly: u.zaakceptowany ? null : { oczekuje: true } });
      // Bez akceptacji sesja powstaje, ale każdy endpoint z danymi odpowiada 403 „oczekuje”.
      return u.zaakceptowany ? true : "/oczekuje";
    },
    async jwt({ token, profile }) {
      if (profile) {
        const c = profile as Claims;
        const email = emailFromClaims(c);
        token.oid = c.oid;
        token.email = email;
        token.name = c.name ?? email;
        token.admin = isAdmin(c.roles, email);
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
