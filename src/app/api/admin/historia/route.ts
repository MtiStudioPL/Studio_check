import { z } from "zod";
import { route } from "@/lib/guard";
import { csvResponse, timeline, toCsv } from "@/lib/admin";
import { fmtDateTime } from "@/lib/time";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Q = z.object({
  od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  osoba: z.string().max(100).optional(),
  kod: z.string().max(100).optional(),
  typ: z.enum(["biore", "oddaje", "sprawdzam", "wizyta", "nieznany"]).optional(),
  uwagi: z.enum(["1", "0"]).optional(),
  strona: z.coerce.number().int().min(1).max(10_000).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = route({ admin: true, limits: ["admin"] }, async ({ req, user, ip }) => {
  const sp = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  const q = Q.parse(sp);
  const f = { od: q.od, do: q.do, osoba: q.osoba, kod: q.kod, typ: q.typ, uwagi: q.uwagi === "1", strona: q.strona };
  if (q.format === "csv") {
    const all = await timeline({ ...f, strona: 1, naStrone: 500 });
    let rows = all.wpisy;
    for (let p = 2; rows.length < all.razem && p <= 100; p++) rows = rows.concat((await timeline({ ...f, strona: p, naStrone: 500 })).wpisy);
    await writeAudit({ userOid: user.oid, zdarzenie: "eksport_csv", obiekt: "historia", szczegoly: { wiersze: rows.length }, wynik: "ok", ip });
    return csvResponse(
      "historia.csv",
      toCsv(["Kiedy", "Akcja", "Kod", "Nazwa", "Kto", "E-mail", "Uwagi", "Źródło"], rows.map((r) => [fmtDateTime(r.kiedy), r.akcja, r.kod, r.nazwa, r.kto, r.email, r.uwagi, r.zrodlo])),
    );
  }
  return timeline(f);
});
