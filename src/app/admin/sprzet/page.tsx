"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, KodChip, Skeleton, StatusPill, pozaOpis, pozaPoTerminie, useToast } from "@/components/ui";
import { PozaSzkolaDialog } from "@/components/poza-szkola-dialog";
import { EquipmentPanel } from "@/components/equipment-panel";
import { IQr } from "@/components/icons";
import { api, ApiError, hoursSince } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";

export default function SprzetAdminPage() {
  const toast = useToast();
  const [lista, setLista] = useState<SprzetView[] | null>(null);
  const [panel, setPanel] = useState<number | null>(null);
  const [edit, setEdit] = useState<SprzetView | null>(null);
  const [poza, setPoza] = useState<SprzetView | null>(null);
  const [nowy, setNowy] = useState({ kod: "", nazwa: "", kategoria: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ lista: SprzetView[] }>("/api/sprzet").then((r) => setLista(r.lista)), []);
  useEffect(() => {
    load().catch((e) => toast((e as Error).message, "bad"));
  }, [load, toast]);

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/sprzet", { method: "POST", body: { kod: Number(nowy.kod), nazwa: nowy.nazwa, kategoria: nowy.kategoria } });
      toast(`Dodano: ${nowy.nazwa}`);
      setNowy({ kod: "", nazwa: "", kategoria: "" });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Nie udało się dodać.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const zapisz = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await api(`/api/admin/sprzet/${edit.kod}`, { method: "PATCH", body: { nazwa: edit.nazwa, kategoria: edit.kategoria, maQr: edit.maQr } });
      toast("Zapisano.");
      setEdit(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Nie udało się zapisać.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const nextKod = lista ? Math.max(0, ...lista.filter((s) => s.kod < 101).map((s) => s.kod)) + 1 : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wide text-3xl font-extrabold">Sprzęt</h1>
          <p className="mt-1 text-sm text-mute">{lista ? `${lista.length} pozycji · ${lista.filter((s) => s.maQr).length} z QR` : "…"}</p>
        </div>
        <Link href="/admin/naklejki" className="flex min-h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
          <IQr size={18} /> Drukuj naklejki QR
        </Link>
      </div>

      <Card className="p-4">
        <h2 className="label mb-3">Dodaj sprzęt</h2>
        <form onSubmit={dodaj} className="grid grid-cols-2 gap-3 md:grid-cols-[110px_1fr_200px_auto]">
          <label className="flex flex-col gap-1 text-xs text-mute">
            Kod
            <input required type="number" min={1} value={nowy.kod} onChange={(e) => setNowy({ ...nowy, kod: e.target.value })} placeholder={String(nextKod)} className="inp font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Kategoria
            <input value={nowy.kategoria} onChange={(e) => setNowy({ ...nowy, kategoria: e.target.value })} maxLength={60} className="inp" />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-mute md:col-span-1 md:row-start-1 md:col-start-2">
            Nazwa
            <input required value={nowy.nazwa} onChange={(e) => setNowy({ ...nowy, nazwa: e.target.value })} maxLength={120} className="inp" />
          </label>
          <Button type="submit" variant="rec" busy={busy} className="col-span-2 self-end md:col-span-1">
            Dodaj
          </Button>
        </form>
        <p className="mt-2 text-xs text-mute">Kody od 101 w górę = sprzęt bez naklejki QR (kable, statywy).</p>
      </Card>

      {!lista ? (
        <Skeleton rows={8} />
      ) : (
        <Card className="divide-y divide-line">
          {lista.map((s) =>
            edit?.kod === s.kod ? (
              <div key={s.kod} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <KodChip kod={s.kod} />
                <input value={edit.nazwa} onChange={(e) => setEdit({ ...edit, nazwa: e.target.value })} className="inp min-w-48 flex-1" aria-label="Nazwa" />
                <input value={edit.kategoria} onChange={(e) => setEdit({ ...edit, kategoria: e.target.value })} className="inp w-40" aria-label="Kategoria" />
                <label className="flex items-center gap-2 text-sm text-mute">
                  <input type="checkbox" checked={edit.maQr} onChange={(e) => setEdit({ ...edit, maQr: e.target.checked })} className="h-4 w-4 accent-[#FF5533]" /> QR
                </label>
                <Button variant="rec" onClick={zapisz} busy={busy}>
                  Zapisz
                </Button>
                <Button onClick={() => setEdit(null)}>Anuluj</Button>
              </div>
            ) : (
              // Telefon: nazwa w pełnej szerokości, przyciski w drugim wierszu; od sm wszystko w jednym.
              <div key={s.kod} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:flex-nowrap">
                <KodChip kod={s.kod} tone={s.status === "poza_szkola" ? "info" : s.status === "wypozyczony" ? "warn" : "mute"} />
                <button onClick={() => setPanel(s.kod)} className="press-soft min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold">{s.nazwa}</div>
                  <div className="text-xs text-mute">
                    {s.kategoria || "—"}
                    {!s.maQr && " · bez QR"}
                    {s.status !== "w_studiu" && ` · ${s.ktoMa}`}
                    {s.status === "poza_szkola" && <span className={pozaPoTerminie(s) ? "text-bad" : "text-info"}> · {pozaOpis(s)}</span>}
                  </div>
                </button>
                <span className="hidden sm:block">
                  <StatusPill status={s.status} over24={hoursSince(s.odKiedy) > 24} />
                </span>
                <div className="flex w-full gap-2 pl-[52px] sm:w-auto sm:pl-0">
                  <Button className="min-h-10 flex-1 px-3 text-sm text-info sm:flex-none" onClick={() => setPoza(s)}>
                    Poza szkołą
                  </Button>
                  <Button className="min-h-10 flex-1 px-3 text-sm sm:flex-none" onClick={() => setEdit(s)}>
                    Edytuj
                  </Button>
                </div>
              </div>
            ),
          )}
        </Card>
      )}
      {panel != null && <EquipmentPanel kod={panel} onClose={() => setPanel(null)} />}
      {poza && <PozaSzkolaDialog kod={poza.kod} nazwa={poza.nazwa} onClose={() => setPoza(null)} onDone={load} />}
    </div>
  );
}
