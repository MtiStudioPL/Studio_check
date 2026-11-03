import { z } from "zod";
import { route } from "@/lib/guard";
import { attendanceReport, csvResponse, toCsv } from "@/lib/admin";
import { fmtDateTime } from "@/lib/time";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Q = z.object({
  od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(["json", "csv", "csv-osoby"]).default("json"),
});

export const GET = route({ admin: true, limits: ["admin"] }, async ({ req, user, ip }) => {
  const q = Q.parse(Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== "")));
  const r = await attendanceReport(q.od, q.do);
  if (q.format === "json") return r;
  await writeAudit({ userOid: user.oid, zdarzenie: "eksport_csv", obiekt: "obecnosci", wynik: "ok", ip });
  if (q.format === "csv-osoby") {
    return csvResponse("obecnosci-osoby.csv", toCsv(["Osoba", "E-mail", "Wizyty", "Łącznie minut", "Zamknięte automatycznie"], r.osoby.map((o) => [o.imie, o.email, o.wizyty, o.minuty, o.auto])));
  }
  return csvResponse(
    "obecnosci.csv",
    toCsv(["Osoba", "E-mail", "Wejście", "Wyjście", "Automatycznie", "Sprzęt przy wyjściu"], r.wizyty.map((w) => [w.imie, w.email, fmtDateTime(w.wejscie), fmtDateTime(w.wyjscie), w.auto ? "tak" : "", w.sprzetPrzyWyjsciu.join(", ")])),
  );
});
