import "server-only";
import { createHash } from "node:crypto";
import { db, schema, type Tx } from "@/db";
import { config } from "./config";

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(config.ipSalt + "|" + ip).digest("hex").slice(0, 16);
}

export function clientIp(req: Request): string | null {
  const h = req.headers;
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

type AuditInput = {
  userOid?: string | null;
  zdarzenie: string;
  obiekt?: string | null;
  szczegoly?: Record<string, unknown> | null;
  ip?: string | null;
  wynik: "ok" | "odmowa" | "limit";
};

/** Audyt nigdy nie wywraca żądania — błąd zapisu ląduje tylko w logu serwera. */
export async function writeAudit(a: AuditInput, tx?: Tx): Promise<void> {
  try {
    await (tx ?? db).insert(schema.audyt).values({
      userOid: a.userOid ?? null,
      zdarzenie: a.zdarzenie,
      obiekt: a.obiekt ?? null,
      szczegoly: a.szczegoly ?? null,
      ipSkrot: hashIp(a.ip),
      wynik: a.wynik,
    });
  } catch (e) {
    if (tx) throw e;
    console.error("[audyt] zapis nieudany", (e as Error).message);
  }
}
