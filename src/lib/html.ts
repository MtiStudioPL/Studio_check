const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Każdy tekst od użytkownika (uwagi, nazwy, imiona) przechodzi tędy, zanim trafi do HTML maila. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => MAP[c]);
}

/** Tabela HTML w stylu obecnych maili (border=1, cellpadding=6, border-collapse). */
export function htmlTable(headers: string[], rows: unknown[][]): string {
  const th = headers.map((h) => `<th align="left">${escapeHtml(h)}</th>`).join("");
  const tr = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table border="1" cellpadding="6" style="border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

/** Składa akapity; zmienne wstawiane wyłącznie przez escapeHtml. */
export function p(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}
