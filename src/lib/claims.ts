export type Claims = {
  tid?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  roles?: string[];
};

export function emailFromClaims(c: Claims): string {
  return String(c.email || c.preferred_username || c.upn || "").trim().toLowerCase();
}

/** Sprawdzenia z planu: tenant szkoły, stały identyfikator, adres w domenie szkoły. */
export function checkClaims(c: Claims, tenantId: string, domain: string): { ok: true } | { ok: false; reason: string } {
  if (!tenantId) return { ok: false, reason: "brak_konfiguracji_tenanta" };
  if (c.tid !== tenantId) return { ok: false, reason: "inny_tenant" };
  if (!c.oid) return { ok: false, reason: "brak_oid" };
  const email = emailFromClaims(c);
  if (!email.endsWith("@" + domain)) return { ok: false, reason: "zla_domena" };
  return { ok: true };
}
