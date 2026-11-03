"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, fmtDateTime, hoursSince } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";
import { Button, KodChip, StatusPill, pozaOpis, useToast } from "./ui";
import { PozaSzkolaDialog } from "./poza-szkola-dialog";
import { IX } from "./icons";

type Os = { kiedy: string; typ: string; kto: string; uwagi: string | null };

/** Panel sprzętu w panelu administratora: stan, Przypomnij, Filtruj ten sprzęt, oś czasu z wysłanymi przypomnieniami. */
export function EquipmentPanel({ kod, onClose }: { kod: number; onClose: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<{ pozycja: SprzetView | null; os: Os[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [poza, setPoza] = useState(false);

  useEffect(() => {
    setD(null);
    api<{ pozycja: SprzetView | null; os: Os[] }>(`/api/admin/sprzet/${kod}/os-czasu`).then(setD).catch((e) => toast((e as Error).message, "bad"));
  }, [kod, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = d?.pozycja;
  const przypomnij = async () => {
    if (!p?.email) return;
    setBusy(true);
    try {
      const r = await api<{ pozycje: number }>("/api/przypomnij", { method: "POST", body: { email: p.email } });
      toast(`Wysłano przypomnienie (${r.pozycje} szt.).`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const dot = (typ: string) =>
    typ.startsWith("Biorę") ? "bg-warn" : typ.startsWith("Oddaję") ? "bg-ok" : typ.startsWith("Poza") ? "bg-info" : typ.startsWith("Przypomnienie") ? "bg-bad" : "bg-mute";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Szczegóły sprzętu"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-line bg-card p-5"
      >
        <div className="flex items-start gap-3">
          <KodChip kod={kod} />
          <div className="flex-1">
            <h2 className="text-lg font-bold">{p?.nazwa ?? (d ? "Nieznany kod" : "…")}</h2>
            {p && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill status={p.status} over24={hoursSince(p.odKiedy) > 24} />
                {p.status === "wypozyczony" && <span className="font-mono text-sm text-bad">{Math.floor(hoursSince(p.odKiedy))} h</span>}
              </div>
            )}
            {p?.status === "wypozyczony" && (
              <p className="mt-1 text-[13px] text-mute">
                {p.ktoMa} · {p.email} · od {fmtDateTime(p.odKiedy)}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Zamknij" className="flex h-11 w-11 items-center justify-center rounded-xl text-mute">
            <IX />
          </button>
        </div>

        {p?.status === "poza_szkola" && (
          <p className="rounded-xl bg-info-bg px-3 py-2 text-sm text-info">
            Poza szkołą · {pozaOpis(p)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="rec" onClick={przypomnij} busy={busy} disabled={!p?.email || p.status === "poza_szkola"}>
            Przypomnij
          </Button>
          <Link href={`/admin/historia?kod=${kod}`} onClick={onClose} className="flex min-h-11 items-center justify-center rounded-xl border border-line-2 text-[15px] font-semibold">
            Filtruj ten sprzęt
          </Link>
          {p && (
            <Button className="col-span-2 text-info" onClick={() => setPoza(true)}>
              Oznacz: poza szkołą…
            </Button>
          )}
        </div>
        {poza && p && (
          <PozaSzkolaDialog
            kod={kod}
            nazwa={p.nazwa}
            onClose={() => setPoza(false)}
            onDone={() => api<{ pozycja: SprzetView | null; os: Os[] }>(`/api/admin/sprzet/${kod}/os-czasu`).then(setD)}
          />
        )}

        <div>
          <h3 className="label mb-3">Historia sprzętu</h3>
          {!d ? (
            <div className="h-32 animate-pulse rounded-xl bg-chip" />
          ) : d.os.length === 0 ? (
            <p className="text-sm text-mute">Brak wpisów.</p>
          ) : (
            <ol className="flex flex-col gap-3.5 border-l-2 border-line pl-4">
              {d.os.map((x, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ${dot(x.typ)}`} />
                  <div className="text-[13px] font-semibold">{x.typ}</div>
                  <div className="mt-0.5 font-mono text-xs text-mute">
                    {fmtDateTime(x.kiedy)} · {x.kto}
                  </div>
                  {x.uwagi && <div className="mt-1 text-xs text-ink/80">„{x.uwagi}”</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
