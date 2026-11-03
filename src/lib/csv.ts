// ---------- CSV ----------
export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // Ochrona przed wstrzyknięciem formuł w Excelu.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Średnik + BOM: polski Excel otwiera poprawnie.
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

export function csvResponse(name: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
