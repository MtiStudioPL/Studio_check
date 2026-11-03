import "server-only";
import { after } from "next/server";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { config } from "./config";

export type MailInput = {
  to: string | string[];
  subject: string;
  html: string;
  rodzaj?: string;
  kod?: number | null;
};

/**
 * Wpis do kolejki mail_outbox — w tej samej transakcji co zmiana stanu.
 * Mail wyjdzie dopiero po zatwierdzeniu transakcji (worker /api/cron/outbox lub po akcji).
 */
export async function enqueueMail(m: MailInput, tx?: Tx) {
  const to = (Array.isArray(m.to) ? m.to : [m.to]).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!to.length) return;
  await (tx ?? db).insert(schema.mailOutbox).values(
    to.map((addr) => ({ do: addr, temat: m.subject, trescHtml: m.html, rodzaj: m.rodzaj ?? "inne", kod: m.kod ?? null })),
  );
}

export function enqueueAdmin(m: Omit<MailInput, "to">, tx?: Tx) {
  return enqueueMail({ ...m, to: config.adminNotify }, tx);
}

// --- Microsoft Graph (uprawnienie aplikacyjne Mail.Send zawężone do skrzynki studia) ---
let tokenCache: { token: string; exp: number } | null = null;

async function graphToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const tenant = process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
  const id = process.env.GRAPH_CLIENT_ID ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const secret = process.env.GRAPH_CLIENT_SECRET ?? process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!tenant || !id || !secret) throw new Error("Brak konfiguracji Graph");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Token Graph: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function sendViaGraph(to: string, subject: string, html: string) {
  const mailbox = config.mailbox;
  if (!mailbox) throw new Error("Brak STUDIO_MAILBOX");
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202 && !res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`sendMail: HTTP ${res.status} ${t.slice(0, 200)}`);
  }
}

const MAX_PROB = 5;

/**
 * Wysyła oczekujące maile. Każdy wiersz jest blokowany (FOR UPDATE SKIP LOCKED),
 * więc dwa równoległe wywołania nie wyślą tego samego maila dwa razy.
 * Ponawianie: do 5 prób z odstępem 1, 4, 9, 16 min.
 */
export async function processOutbox(limit = 25): Promise<{ wyslane: number; bledy: number }> {
  let wyslane = 0, bledy = 0;
  for (let i = 0; i < limit; i++) {
    const done = await db.transaction(async (tx) => {
      const [m] = await tx
        .select()
        .from(schema.mailOutbox)
        .where(and(eq(schema.mailOutbox.status, "oczekuje"), lte(schema.mailOutbox.nastepnaProba, sql`now()`)))
        .orderBy(asc(schema.mailOutbox.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!m) return false;
      try {
        if (config.mailDisabled) {
          console.log(`[mail wyłączony] ${m.do}: ${m.temat}`);
        } else {
          await sendViaGraph(m.do, m.temat, m.trescHtml);
        }
        await tx
          .update(schema.mailOutbox)
          .set({ status: "wyslany", wyslano: sql`now()`, proby: m.proby + 1, ostatniBlad: null })
          .where(eq(schema.mailOutbox.id, m.id));
        wyslane++;
      } catch (e) {
        const proby = m.proby + 1;
        bledy++;
        await tx
          .update(schema.mailOutbox)
          .set({
            proby,
            status: proby >= MAX_PROB ? "blad" : "oczekuje",
            nastepnaProba: sql`now() + make_interval(mins => ${proby * proby})`,
            ostatniBlad: (e as Error).message.slice(0, 500),
          })
          .where(eq(schema.mailOutbox.id, m.id));
        console.error("[mail]", m.id, (e as Error).message);
      }
      return true;
    });
    if (!done) break;
  }
  return { wyslane, bledy };
}

/** Szybka wysyłka po akcji, bez czekania na cron. Błędy nie psują odpowiedzi — zostaje kolejka. */
export function flushOutboxSoon() {
  // after(): Vercel czeka na zadanie po wysłaniu odpowiedzi, zamiast je ucinać.
  after(() => processOutbox(10).then(() => undefined).catch((e) => console.error("[mail] flush", (e as Error).message)));
}
