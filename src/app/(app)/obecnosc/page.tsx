"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Empty, ScreenHeader, Skeleton, initialsFrom, useToast } from "@/components/ui";
import { IEnter, IExit } from "@/components/icons";
import { useMe } from "@/components/me";
import { api, fmtClock, fmtDateTime, fmtTime } from "@/lib/client";

type Osoba = { id: number; imie: string; wejscie: string };
type Wizyta = { id: number; wejscie: string; wyjscie: string | null; auto: boolean; zamknietaPrzez: string | null };

export default function ObecnoscPage() {
  const toast = useToast();
  const { me } = useMe();
  const [teraz, setTeraz] = useState<Osoba[] | null>(null);
  const [moje, setMoje] = useState<Wizyta[] | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    api<{ osoby: Osoba[] }>("/api/obecnosc/teraz").then((r) => setTeraz(r.osoby)).catch((e) => toast((e as Error).message, "bad"));
    api<{ wizyty: Wizyta[] }>("/api/obecnosc/moje").then((r) => setMoje(r.wizyty)).catch(() => {});
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [toast]);

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Obecność" />
      <div className="flex flex-col gap-4 px-5 pt-2">
        {me?.wizyta ? (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-ok shadow-[0_0_0_5px_rgba(61,220,151,0.16)]" />
              <span className="text-[15px] font-semibold">Jesteś w studiu od {fmtTime(me.wizyta.wejscie)}</span>
            </div>
            <div className="font-mono text-[34px] font-semibold leading-none">{fmtClock(Date.now() - new Date(me.wizyta.wejscie).getTime())}</div>
            <Link href="/wyjscie" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line-2 font-semibold">
              <IExit size={18} /> Wychodzę
            </Link>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            <span className="text-[15px] font-semibold">Nie jesteś teraz w studiu</span>
            <p className="text-[13px] text-mute">Check-in robisz, skanując kod QR przy drzwiach studia.</p>
            <Link href="/skaner?tryb=drzwi" className="flex h-12 items-center justify-center gap-2 rounded-xl bg-rec font-extrabold text-bg">
              <IEnter size={18} /> Skanuj kod drzwi
            </Link>
          </Card>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="label">W studiu teraz {teraz ? `(${teraz.length})` : ""}</h2>
          {!teraz ? (
            <Skeleton rows={2} />
          ) : teraz.length === 0 ? (
            <Empty>Nikogo nie ma w studiu.</Empty>
          ) : (
            teraz.map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip text-xs font-semibold">{initialsFrom(o.imie)}</span>
                <span className="flex-1 text-sm font-semibold">{o.imie}</span>
                <span className="font-mono text-xs text-mute">od {fmtTime(o.wejscie)}</span>
              </div>
            ))
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="label">Moje wizyty · 30 dni</h2>
          {!moje ? (
            <Skeleton rows={3} />
          ) : moje.length === 0 ? (
            <Empty>Brak wizyt w ostatnich 30 dniach.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {moje.map((w) => {
                const ms = (w.wyjscie ? new Date(w.wyjscie).getTime() : Date.now()) - new Date(w.wejscie).getTime();
                return (
                  <li key={w.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{fmtDateTime(w.wejscie)}</div>
                      <div className="text-xs text-mute">
                        {w.wyjscie ? `do ${fmtTime(w.wyjscie)}` : "trwa"}
                        {w.auto && <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-warn">zamknięta automatycznie</span>}
                        {w.zamknietaPrzez && <span className="ml-2 rounded-full bg-chip px-2 py-0.5">zamknięta przez admina</span>}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-mute">{fmtClock(ms).slice(0, 5)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
