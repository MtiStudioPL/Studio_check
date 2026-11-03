/**
 * Zamienia treść zeskanowanego kodu QR (albo wpisany tekst) na kod sprzętu.
 * Obsługiwane formaty:
 *  - stary link Forms:  …&r…=12  (kod po ostatnim "=", obcięty po kropce)
 *  - nowy link:         https://<domena>/q?kod=12
 *  - sam numer:         "12", "12.0"
 * Zwraca null, gdy nie ma poprawnej liczby całkowitej >= 1.
 */
export function parseKod(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const k = u.searchParams.get("kod");
      if (k != null) s = k;
      else if (s.includes("=")) s = decodeURIComponent(s.slice(s.lastIndexOf("=") + 1));
      else return null;
    } catch {
      return null;
    }
  } else if (s.includes("=")) {
    s = s.slice(s.lastIndexOf("=") + 1);
  }

  s = s.trim();
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot);
  if (!/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
