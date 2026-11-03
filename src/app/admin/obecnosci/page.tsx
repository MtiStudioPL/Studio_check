"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Skeleton, useToast } from "@/components/ui";
import { IDownload } from "@/components/icons";
import { api, ApiError, fmtDateTime, fmtTime } from "@/lib/client";

type Osoba = { email: string; imie: string; wizyty: number; minuty: number; auto: number };
type Wizyta = { id: number; imie: string; email: string; wejscie: string; wyjscie: string | null; auto: boolean; zamknietaPrzez: string | null; sprzetPrzyWyjsciu: number[] };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ObecnosciPage() {
  const toast = useToast();
  const [od, setOd] = useState(iso(new Date(Date.now() - 30 * 86_400_000)));
  const [doo, setDo] = useState(iso(new Date()));
  const [d, setD] = useState<{ osoby: Osoba[]; wizyty: Wizyta[] } | null>(null);

  const load = useCallback(() => {
    setD(null);
    api<{ osoby: Osoba[]; wizyty: Wizyta[] }>(`/api/admin/obecnosci?od=${od}&do=${doo}`).then(setD).catch((e) => toast((e as Error).message, "bad"));
  }, [od, doo, toast]);
  useEffect(load, [load]);

  const zamknij = async (w: Wizyta) => {
    const powod = prompt(`Zamknąć wizytę: ${w.imie}? Podaj powód (trafi do audytu):`, "Zapomniany check-out");
    if (!powod) return;
    try {
      await api(`/api/admin/obecnosc/${w.id}/zamknij`, { method: "POST", body: { powod } });
      toast("Wizyta zamknięta.");
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    }
  };

  const h = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="wide text-3xl font-extrabold">Obecności</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-mute">
            Od <input type="date" value={od} onChange={(e) => setOd(e.target.value)} className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Do <input type="date" value={doo} onChange={(e) => setDo(e.target.value)} className="inp" />
          </label>
          <a href={`/api/admin/obecnosci?od=${od}&do=${doo}&format=csv`} className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-3 text-sm font-semibold">
            <IDownload size={16} /> Wizyty CSV
          </a>
          <a href={`/api/admin/obecnosci?od=${od}&do=${doo}&format=csv-osoby`} className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-3 text-sm font-semibold">
            <IDownload size={16} /> Osoby CSV
          </a>
        </div>
      </div>

      {!d ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-mute">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-medium">Osoba</th>
                  <th className="px-4 py-3 font-medium">Wizyty</th>
                  <th className="px-4 py-3 font-medium">Łącznie</th>
                  <th className="px-4 py-3 font-medium">Bez check-outu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.osoby.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-mute">
                      Brak wizyt w tym okresie.
                    </td>
                  </tr>
                ) : (
                  d.osoby.map((o) => (
                    <tr key={o.email}>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{o.imie}</div>
                        <div className="text-xs text-mute">{o.email}</div>
                      </td>
                      <td className="px-4 py-2.5 font-mono">{o.wizyty}</td>
                      <td className="px-4 py-2.5 font-mono">{h(o.minuty)}</td>
                      <td className={`px-4 py-2.5 font-mono ${o.auto ? "text-warn" : "text-mute"}`}>{o.auto}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>

          <section>
            <h2 className="label mb-2">Wizyty</h2>
            {d.wizyty.length === 0 ? (
              <Empty>Brak wizyt.</Empty>
            ) : (
              <Card className="divide-y divide-line">
                {d.wizyty.map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-28 font-mono text-xs text-mute">{fmtDateTime(w.wejscie)}</span>
                    <span className="min-w-32 flex-1 font-semibold">{w.imie}</span>
                    <span className="text-mute">
                      {w.wyjscie ? `do ${fmtTime(w.wyjscie)}` : <span className="text-ok">w studiu</span>}
                      {w.auto && <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn">auto</span>}
                      {w.zamknietaPrzez && <span className="ml-2 rounded-full bg-chip px-2 py-0.5 text-xs">admin</span>}
                      {w.sprzetPrzyWyjsciu.length > 0 && <span className="ml-2 text-xs text-warn">wyszedł ze sprzętem: {w.sprzetPrzyWyjsciu.join(", ")}</span>}
                    </span>
                    {!w.wyjscie && (
                      <Button className="min-h-10 px-3 text-sm" onClick={() => zamknij(w)}>
                        Zamknij wizytę
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
