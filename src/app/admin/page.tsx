"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, KodChip, Skeleton, pozaOpis, useToast } from "@/components/ui";
import { EquipmentPanel } from "@/components/equipment-panel";
import { IAlert, IDownload } from "@/components/icons";
import { api, ApiError, fmtClock, fmtDateTime, fmtTime, hoursSince } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";

type Pulpit = {
  kafelki: {
    wszystkie: number; poza: number; ponad24: number; sprawdzone: number; w_studiu_teraz: number; biore_dzis: number; oddaje_dzis: number; auto_wczoraj: number;
    poza_szkola: number; osoby_oczekuja: number; rezerwacje_oczekuja: number; rezerwacje_dzis: number;
  };
  uwaga: {
    ponad24: SprzetView[];
    zdarzenia: { id: number; rodzaj: string; temat: string; kod: number | null; kiedy: string }[];
    zablokowani: { oid: string; email: string; imie: string; powod: string | null }[];
    oczekujaOsoby: { oid: string; email: string; imie: string }[];
    pozaPoTerminie: SprzetView[];
  };
  teraz: { id: number; imie: string; email: string; wejscie: string; przySobie: { kod: number; nazwa: string }[] }[];
  aktywnosc: { dzien: string; biore: number; oddaje: number }[];
  top: { kod: number; nazwa: string; ile: number }[];
  ostatnie: { rodzaj: string; id: number; kiedy: string; akcja: string; kod: number | null; nazwa: string; kto: string }[];
};

export default function PulpitPage() {
  const toast = useToast();
  const [d, setD] = useState<Pulpit | null>(null);
  const [panel, setPanel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Pulpit>("/api/admin/pulpit").then(setD).catch((e) => toast((e as Error).message, "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const call = async (key: string, path: string, ok: (r: Record<string, number>) => string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key);
    try {
      toast(ok(await api<Record<string, number>>(path, { method: "POST" })));
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const przypomnij = async (email: string) => {
    try {
      const r = await api<{ pozycje: number }>("/api/przypomnij", { method: "POST", body: { email } });
      toast(`Wysłano przypomnienie (${r.pozycje} szt.).`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    }
  };

  const k = d?.kafelki;
  const maxAkt = Math.max(1, ...(d?.aktywnosc.map((a) => Math.max(a.biore, a.oddaje)) ?? [1]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wide text-3xl font-extrabold">Pulpit</h1>
          <p className="mt-1 text-sm text-mute">Odświeża się co minutę.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/historia?format=csv" className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
            <IDownload size={18} /> Eksport CSV
          </a>
          <Button busy={busy === "braki"} disabled={!!busy} onClick={() => call("braki", "/api/inwentaryzacja/przypomnienia", (r) => (r.braki ? `Wysłano maile o ${r.braki} brakach.` : "Brak braków."))}>
            Przypomnij o brakach
          </Button>
          <Button
            variant="rec"
            busy={busy === "start"}
            disabled={!!busy}
            onClick={() => call("start", "/api/inwentaryzacja/start", (r) => `Inwentaryzacja rozpoczęta (${r.zmienione} pozycji).`, "Rozpocząć nową inwentaryzację? Wszystkie pozycje zostaną oznaczone jako niesprawdzone.")}
          >
            Rozpocznij inwentaryzację
          </Button>
        </div>
      </div>

      {!d || !k ? (
        <Skeleton rows={4} />
      ) : (
        <>
          {(k.osoby_oczekuja > 0 || k.rezerwacje_oczekuja > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {k.rezerwacje_oczekuja > 0 && (
                <Link href="/admin/rezerwacje" className="flex items-center justify-between rounded-[18px] border border-warn/40 bg-warn-bg/40 px-4 py-3.5">
                  <span className="font-semibold text-warn">Rezerwacje do decyzji</span>
                  <span className="font-mono text-2xl font-semibold text-warn">{k.rezerwacje_oczekuja}</span>
                </Link>
              )}
              {k.osoby_oczekuja > 0 && (
                <Link href="/admin/uzytkownicy" className="flex items-center justify-between rounded-[18px] border border-warn/40 bg-warn-bg/40 px-4 py-3.5">
                  <span className="font-semibold text-warn">Osoby czekają na akceptację</span>
                  <span className="font-mono text-2xl font-semibold text-warn">{k.osoby_oczekuja}</span>
                </Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label={`Poza studiem${k.poza_szkola ? ` · ${k.poza_szkola} poza szkołą` : ""}`} value={`${k.poza} / ${k.wszystkie}`} />
            <Tile label="Ponad 24 h" value={k.ponad24} tone={k.ponad24 ? "bad" : undefined} />
            <Tile label="W studiu teraz" value={k.w_studiu_teraz} />
            <Tile label="Dziś Biorę / Oddaję" value={`${k.biore_dzis} / ${k.oddaje_dzis}`} />
            <Tile label="Inwentaryzacja" value={`${k.sprawdzone} / ${k.wszystkie}`} tone={k.sprawdzone === k.wszystkie ? "ok" : undefined} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-4">
              <h2 className="label mb-3 flex items-center gap-2">
                <IAlert size={16} className="text-bad" /> Wymaga uwagi
              </h2>
              {d.uwaga.ponad24.length + d.uwaga.zdarzenia.length + d.uwaga.zablokowani.length + d.uwaga.pozaPoTerminie.length === 0 ? (
                <Empty>Nic nie wymaga reakcji.</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {d.uwaga.ponad24.map((s) => (
                    <li key={`s${s.kod}`} className="flex items-center gap-3 py-2.5">
                      <KodChip kod={s.kod} tone="bad" />
                      <button onClick={() => setPanel(s.kod)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-semibold">{s.nazwa}</div>
                        <div className="text-xs text-mute">
                          {s.ktoMa} · {Math.floor(hoursSince(s.odKiedy))} h
                        </div>
                      </button>
                      {s.email && (
                        <Button className="min-h-10 px-3 text-sm" onClick={() => przypomnij(s.email!)}>
                          Przypomnij
                        </Button>
                      )}
                    </li>
                  ))}
                  {d.uwaga.pozaPoTerminie.map((s) => (
                    <li key={`p${s.kod}`} className="flex items-center gap-3 py-2.5">
                      <KodChip kod={s.kod} tone="info" />
                      <button onClick={() => setPanel(s.kod)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-semibold">{s.nazwa}</div>
                        <div className="text-xs text-bad">
                          poza szkołą po terminie · {s.ktoMa} · {pozaOpis(s)}
                        </div>
                      </button>
                    </li>
                  ))}
                  {d.uwaga.zdarzenia.map((z) => (
                    <li key={`z${z.id}`} className="flex items-center gap-3 py-2.5">
                      <KodChip kod={z.kod} tone="warn" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{z.temat.replace(/^Studio: /, "")}</div>
                        <div className="text-xs text-mute">{fmtDateTime(z.kiedy)}</div>
                      </div>
                      {z.kod != null && (
                        <Button className="min-h-10 px-3 text-sm" onClick={() => setPanel(z.kod!)}>
                          Historia
                        </Button>
                      )}
                    </li>
                  ))}
                  {d.uwaga.zablokowani.map((u) => (
                    <li key={u.oid} className="flex items-center gap-3 py-2.5">
                      <span className="rounded-lg bg-bad-bg px-2 py-1 text-xs font-semibold text-bad">BLOKADA</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{u.imie}</div>
                        <div className="text-xs text-mute">{u.powod}</div>
                      </div>
                      <Link href="/admin/uzytkownicy" className="flex min-h-10 items-center rounded-xl border border-line-2 px-3 text-sm font-semibold">
                        Sprawdź
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="label mb-3">Teraz w studiu ({d.teraz.length})</h2>
              {d.teraz.length === 0 ? (
                <Empty>Nikogo nie ma w studiu.</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {d.teraz.map((o) => (
                    <li key={o.id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{o.imie}</span>
                        <span className="font-mono text-xs text-mute">
                          od {fmtTime(o.wejscie)} · {fmtClock(Date.now() - new Date(o.wejscie).getTime()).slice(0, 5)}
                        </span>
                      </div>
                      {o.przySobie.length > 0 && <div className="mt-1 text-xs text-warn">ma przy sobie: {o.przySobie.map((p) => p.nazwa).join(", ")}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {k.auto_wczoraj > 0 && <p className="mt-3 text-xs text-mute">Wizyt zamkniętych automatycznie w ostatniej dobie: {k.auto_wczoraj}</p>}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="label">Aktywność · 14 dni</h2>
                <div className="flex gap-3 text-xs text-mute">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-warn" /> Biorę
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-ok" /> Oddaję
                  </span>
                </div>
              </div>
              <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Wykres akcji Biorę i Oddaję z 14 dni">
                {d.aktywnosc.map((a) => (
                  <div key={a.dzien} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end justify-center gap-0.5">
                      <div className="w-1/2 max-w-3 rounded-t bg-warn" style={{ height: `${(a.biore / maxAkt) * 100}%` }} title={`Biorę: ${a.biore}`} />
                      <div className="w-1/2 max-w-3 rounded-t bg-ok" style={{ height: `${(a.oddaje / maxAkt) * 100}%` }} title={`Oddaję: ${a.oddaje}`} />
                    </div>
                    <span className="font-mono text-[10px] text-mute">{a.dzien.slice(8)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="label mb-3">Najczęściej wypożyczane · 30 dni</h2>
              {d.top.length === 0 ? (
                <Empty>Brak wypożyczeń.</Empty>
              ) : (
                <ol className="flex flex-col gap-2">
                  {d.top.map((t, i) => (
                    <li key={t.kod} className="flex items-center gap-3">
                      <span className="w-4 font-mono text-xs text-mute">{i + 1}</span>
                      <button onClick={() => setPanel(t.kod)} className="flex-1 truncate text-left text-sm font-semibold">
                        {t.nazwa}
                      </button>
                      <span className="font-mono text-sm">{t.ile}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="label">Ostatnie akcje</h2>
              <Link href="/admin/historia" className="text-sm font-semibold text-rec-soft">
                Cała historia →
              </Link>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {d.ostatnie.map((r) => (
                <li key={`${r.rodzaj}${r.id}${r.akcja}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 font-mono text-xs text-mute">{fmtDateTime(r.kiedy)}</span>
                  <span className="w-28 font-semibold">{r.akcja}</span>
                  <span className="min-w-0 flex-1 truncate">{r.nazwa}</span>
                  <span className="hidden text-mute sm:inline">{r.kto}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {panel != null && <EquipmentPanel kod={panel} onClose={() => setPanel(null)} />}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "ok" }) {
  return (
    <Card className="px-4 py-3.5">
      <div className={`font-mono text-[28px] font-semibold leading-none ${tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : ""}`}>{value}</div>
      <div className="mt-2 text-[13px] text-mute">{label}</div>
    </Card>
  );
}
