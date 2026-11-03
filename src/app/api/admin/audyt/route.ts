import { z } from "zod";
import { route } from "@/lib/guard";
import { auditLog, csvResponse, toCsv } from "@/lib/admin";
import { fmtDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const Q = z.object({
  od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  strona: z.coerce.number().int().min(1).max(10_000).default(1),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = route({ admin: true, limits: ["admin"] }, async ({ req }) => {
  const q = Q.parse(Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== "")));
  const wpisy = await auditLog(q.od, q.do, q.strona);
  if (q.format === "csv") {
    return csvResponse("audyt.csv", toCsv(["Kiedy", "Zdarzenie", "Wynik", "Konto", "Obiekt", "Szczegóły"], wpisy.map((w) => [fmtDateTime(w.kiedy), w.zdarzenie, w.wynik, w.email, w.obiekt, w.szczegoly ? JSON.stringify(w.szczegoly) : ""])));
  }
  return { wpisy };
});
