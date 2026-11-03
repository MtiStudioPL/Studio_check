"use client";

import { useEffect, useState } from "react";
import { Card, Empty, Skeleton, cx, useToast } from "@/components/ui";
import { IDownload } from "@/components/icons";
import { api, fmtDateTime } from "@/lib/client";

type W = { id: number; kiedy: string; zdarzenie: string; obiekt: string | null; szczegoly: Record<string, unknown> | null; wynik: "ok" | "odmowa" | "limit"; email: string | null };

export default function AudytPage() {
  const toast = useToast();
  const [strona, setStrona] = useState(1);
  const [wpisy, setWpisy] = useState<W[] | null>(null);

  useEffect(() => {
    setWpisy(null);
    api<{ wpisy: W[] }>(`/api/admin/audyt?strona=${strona}`).then((r) => setWpisy(r.wpisy)).catch((e) => toast((e as Error).message, "bad"));
  }, [strona, toast]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wide text-3xl font-extrabold">Audyt</h1>
          <p className="mt-1 text-sm text-mute">Logowania, odmowy, przekroczenia limitów i działania administratorów · 30 dni</p>
        </div>
        <a href="/api/admin/audyt?format=csv" className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
          <IDownload size={18} /> Eksport CSV
        </a>
      </div>
      {!wpisy ? (
        <Skeleton rows={10} />
      ) : wpisy.length === 0 ? (
        <Empty>Brak wpisów.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {wpisy.map((w) => (
            <div key={w.id} className="grid grid-cols-[110px_1fr] gap-x-3 px-4 py-2.5 text-sm md:grid-cols-[120px_90px_220px_1fr]">
              <span className="font-mono text-xs text-mute">{fmtDateTime(w.kiedy)}</span>
              <span className={cx("font-semibold", w.wynik === "ok" ? "text-ok" : w.wynik === "limit" ? "text-warn" : "text-bad")}>{w.wynik}</span>
              <span className="font-semibold">{w.zdarzenie}</span>
              <span className="min-w-0 truncate text-mute">
                {[w.email, w.obiekt, w.szczegoly ? JSON.stringify(w.szczegoly) : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          ))}
        </Card>
      )}
      <div className="flex justify-center gap-3">
        <button disabled={strona <= 1} onClick={() => setStrona((s) => s - 1)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
          ← Nowsze
        </button>
        <button disabled={(wpisy?.length ?? 0) < 100} onClick={() => setStrona((s) => s + 1)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
          Starsze →
        </button>
      </div>
    </div>
  );
}
