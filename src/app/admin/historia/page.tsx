"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, Empty, Skeleton, cx, useToast } from "@/components/ui";
import { EquipmentPanel } from "@/components/equipment-panel";
import { IDownload } from "@/components/icons";
import { api, dayKey, fmtDayHeader, fmtTime } from "@/lib/client";

type Row = { rodzaj: "sprzet" | "wizyta"; id: number; kiedy: string; akcja: string; kod: number | null; nazwa: string; kto: string; email: string; uwagi: string | null; zrodlo: string | null };
type Res = { wpisy: Row[]; razem: number; strona: number; naStrone: number };

const TYPY = [
  ["", "Wszystko"],
  ["biore", "Biorę"],
  ["oddaje", "Oddaję"],
  ["sprawdzam", "Sprawdzam"],
  ["wizyta", "Check-in / out"],
  ["nieznany", "Nieznany kod"],
] as const;

export default function Page() {
  return (
    <Suspense>
      <Historia />
    </Suspense>
  );
}

function Historia() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [d, setD] = useState<Res | null>(null);
  const [panel, setPanel] = useState<number | null>(null);
  // Filtry siedzą w adresie strony — widok można zapisać w zakładkach.
  const f = { od: sp.get("od") ?? "", do: sp.get("do") ?? "", osoba: sp.get("osoba") ?? "", kod: sp.get("kod") ?? "", typ: sp.get("typ") ?? "", uwagi: sp.get("uwagi") ?? "", strona: sp.get("strona") ?? "1" };
  const [osoba, setOsoba] = useState(f.osoba);
  const [kod, setKod] = useState(f.kod);
  const qs = sp.toString();

  useEffect(() => {
    setD(null);
    api<Res>(`/api/admin/historia?${qs}`).then(setD).catch((e) => toast((e as Error).message, "bad"));
  }, [qs, toast]);

  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    if (!("strona" in patch)) n.delete("strona");
    router.push(`${path}?${n.toString()}`);
  };

  const csv = new URLSearchParams(sp);
  csv.set("format", "csv");
  csv.delete("strona");

  // grupowanie po dniach
  const groups: { day: string; rows: Row[] }[] = [];
  for (const r of d?.wpisy ?? []) {
    const k = dayKey(r.kiedy);
    if (groups.at(-1)?.day !== k) groups.push({ day: k, rows: [] });
    groups.at(-1)!.rows.push(r);
  }
  const pages = d ? Math.max(1, Math.ceil(d.razem / d.naStrone)) : 1;
  const page = Number(f.strona) || 1;

  const tone = (a: string) =>
    a === "Biorę" ? "text-warn" : a === "Oddaję" ? "text-ok" : a === "Poza szkołą" ? "text-info" : a.startsWith("Check") ? "text-info" : "text-mute";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wide text-3xl font-extrabold">Historia</h1>
          <p className="mt-1 text-sm text-mute">{d ? `${d.razem} wpisów` : "…"} · tylko odczyt</p>
        </div>
        <a href={`/api/admin/historia?${csv}`} className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
          <IDownload size={18} /> Eksport CSV
        </a>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Od">
            <input type="date" value={f.od} onChange={(e) => set({ od: e.target.value })} className="inp" />
          </Field>
          <Field label="Do">
            <input type="date" value={f.do} onChange={(e) => set({ do: e.target.value })} className="inp" />
          </Field>
          <Field label="Osoba">
            <input value={osoba} onChange={(e) => setOsoba(e.target.value)} onBlur={() => set({ osoba })} onKeyDown={(e) => e.key === "Enter" && set({ osoba })} placeholder="imię lub e-mail" className="inp" />
          </Field>
          <Field label="Sprzęt">
            <input value={kod} onChange={(e) => setKod(e.target.value)} onBlur={() => set({ kod })} onKeyDown={(e) => e.key === "Enter" && set({ kod })} placeholder="kod lub nazwa" className="inp" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {TYPY.map(([v, l]) => (
            <button key={v} onClick={() => set({ typ: v })} className={cx("min-h-10 rounded-full border px-3.5 text-sm font-semibold", f.typ === v ? "border-rec bg-rec/10 text-rec-soft" : "border-line text-mute")}>
              {l}
            </button>
          ))}
          <label className="ml-auto flex min-h-10 items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={f.uwagi === "1"} onChange={(e) => set({ uwagi: e.target.checked ? "1" : "" })} className="h-4 w-4 accent-[#FF5533]" />
            Tylko z uwagami
          </label>
          {qs && (
            <button onClick={() => { setOsoba(""); setKod(""); router.push(path); }} className="min-h-10 px-2 text-sm text-mute underline underline-offset-4">
              Wyczyść
            </button>
          )}
        </div>
      </Card>

      {!d ? (
        <Skeleton rows={8} />
      ) : d.wpisy.length === 0 ? (
        <Empty>Brak wpisów dla tych filtrów.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <h2 className="label mb-2 first-letter:uppercase">{fmtDayHeader(g.rows[0].kiedy)}</h2>
            <Card className="divide-y divide-line">
              {g.rows.map((r) => (
                <button
                  key={`${r.rodzaj}${r.id}${r.akcja}`}
                  onClick={() => r.kod != null && setPanel(r.kod)}
                  disabled={r.kod == null}
                  className="grid w-full grid-cols-[56px_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 text-left text-sm enabled:hover:bg-card-2 md:grid-cols-[56px_140px_1fr_200px]"
                >
                  <span className="font-mono text-xs text-mute md:text-sm">{fmtTime(r.kiedy)}</span>
                  <span className={cx("font-semibold", tone(r.akcja))}>{r.akcja}</span>
                  <span className="col-start-2 min-w-0 md:col-start-auto">
                    {r.kod != null && <span className="mr-2 font-mono text-xs text-mute">{String(r.kod).padStart(3, "0")}</span>}
                    {r.nazwa}
                    {r.uwagi && <span className="mt-0.5 block text-xs text-mute">„{r.uwagi}”</span>}
                  </span>
                  <span className="col-start-2 truncate text-xs text-mute md:col-start-auto md:text-sm">{r.kto}</span>
                </button>
              ))}
            </Card>
          </section>
        ))
      )}

      {d && pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => set({ strona: String(page - 1) })} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
            ← Nowsze
          </button>
          <span className="font-mono text-sm text-mute">
            {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => set({ strona: String(page + 1) })} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-40">
            Starsze →
          </button>
        </div>
      )}
      {panel != null && <EquipmentPanel kod={panel} onClose={() => setPanel(null)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-mute">
      {label}
      {children}
    </label>
  );
}
