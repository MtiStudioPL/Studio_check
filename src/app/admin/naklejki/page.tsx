"use client";

import { useEffect, useState } from "react";
import { QrImage } from "@/components/qr-image";
import { Button } from "@/components/ui";
import { api } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";

/** Arkusz naklejek do druku: nowy link https://<domena>/q?kod=N. */
export default function NaklejkiPage() {
  const [lista, setLista] = useState<SprzetView[] | null>(null);
  const [wybrane, setWybrane] = useState<Set<number>>(new Set());
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    api<{ lista: SprzetView[] }>("/api/sprzet?filtr=wszystko").then((r) => {
      const qr = r.lista.filter((s) => s.maQr);
      setLista(qr);
      setWybrane(new Set(qr.map((s) => s.kod)));
    });
  }, []);

  const toggle = (k: number) =>
    setWybrane((w) => {
      const n = new Set(w);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const doDruku = (lista ?? []).filter((s) => wybrane.has(s.kod));

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="wide text-3xl font-extrabold">Naklejki QR</h1>
          <p className="mt-1 text-sm text-mute">Nowe naklejki otwierają aplikację zamiast Forms. Wybrano {doDruku.length}.</p>
        </div>
        <Button variant="rec" onClick={() => window.print()}>
          Drukuj
        </Button>
      </div>

      <div className="no-print flex flex-wrap gap-2">
        {(lista ?? []).map((s) => (
          <label key={s.kod} className="flex min-h-10 items-center gap-2 rounded-full border border-line px-3 text-sm">
            <input type="checkbox" checked={wybrane.has(s.kod)} onChange={() => toggle(s.kod)} className="h-4 w-4 accent-[#FF5533]" />
            <span className="font-mono text-xs">{s.kod}</span> {s.nazwa}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-4 print:gap-2">
        {doDruku.map((s) => (
          <div key={s.kod} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-white p-3 text-center text-black print:break-inside-avoid print:border-black/30">
            <QrImage text={`${origin}/q?kod=${s.kod}`} size={130} label={`Kod QR sprzętu ${s.kod}`} />
            <div className="font-mono text-lg font-bold">{String(s.kod).padStart(3, "0")}</div>
            <div className="text-xs leading-tight">{s.nazwa}</div>
            <div className="text-[9px] uppercase tracking-widest text-black/60">Studio wideo</div>
          </div>
        ))}
      </div>
    </div>
  );
}
