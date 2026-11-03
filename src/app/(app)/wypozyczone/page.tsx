"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Empty, KodChip, ScreenHeader, Skeleton, pozaOpis, pozaPoTerminie, useToast } from "@/components/ui";
import { IClipboard } from "@/components/icons";
import { useMe } from "@/components/me";
import { api, ApiError, fmtDateTime, hoursSince, uuid } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";

export default function WypozyczonePage() {
  const toast = useToast();
  const { me } = useMe();
  const [lista, setLista] = useState<SprzetView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<{ lista: SprzetView[] }>("/api/sprzet?filtr=wypozyczone").then((r) => setLista(r.lista)), []);
  useEffect(() => {
    load().catch((e) => toast((e as Error).message, "bad"));
  }, [load, toast]);

  const przypomnij = async (email: string) => {
    setBusy(`p:${email}`);
    try {
      const r = await api<{ pozycje: number }>("/api/przypomnij", { method: "POST", body: { email } });
      toast(r.pozycje ? `Wysłano przypomnienie (${r.pozycje} szt.).` : "Ta osoba nie ma już sprzętu.", r.pozycje ? "ok" : "warn");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się wysłać.", "bad");
    } finally {
      setBusy(null);
    }
  };

  // „To ja mam” = Biorę na siebie (przejęcie, administrator dostaje informację).
  const toJaMam = async (s: SprzetView) => {
    if (!confirm(`Zapisać „${s.nazwa}” na Ciebie? ${s.ktoMa} przestanie figurować jako osoba z tym sprzętem.`)) return;
    setBusy(`m:${s.kod}`);
    try {
      const r = await api<{ ostrzezenie?: string }>("/api/akcja", { method: "POST", body: { kod: s.kod, akcja: "biore", request_id: uuid(), zrodlo: "aplikacja", uwagi: "To ja mam" } });
      toast(r.ostrzezenie ?? "Zapisane na Ciebie.", r.ostrzezenie ? "warn" : "ok");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się zapisać.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col">
      <ScreenHeader
        title="Wypożyczone"
        right={
          <Link href="/inwentaryzacja" className="press mr-2 flex h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold">
            <IClipboard size={18} className="text-ok" /> <span className="max-[359px]:sr-only">Inwentaryzacja</span>
          </Link>
        }
      />
      <div className="stagger flex flex-col gap-2 px-5 pt-2">
        <p className="text-[13px] text-mute">Najdłużej wypożyczone na górze. Ponad 24 h na czerwono, poza szkołą na niebiesko.</p>
        {!lista ? (
          <Skeleton rows={4} />
        ) : lista.length === 0 ? (
          <Empty>Cały sprzęt jest w studiu.</Empty>
        ) : (
          lista.map((s) => {
            const h = hoursSince(s.odKiedy);
            const mine = s.email === me?.email;
            if (s.status === "poza_szkola") {
              const late = pozaPoTerminie(s);
              return (
                <div key={s.kod} className="flex flex-col gap-2 rounded-[18px] border border-info/25 bg-card p-3.5">
                  <div className="flex items-start gap-3">
                    <KodChip kod={s.kod} tone="info" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{s.nazwa}</div>
                      <div className="mt-0.5 text-[13px] text-mute">
                        {mine ? "Ty" : s.ktoMa} · od {fmtDateTime(s.odKiedy)}
                      </div>
                    </div>
                    <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-info">Poza szkołą</span>
                  </div>
                  <div className={`text-[13px] ${late ? "font-semibold text-bad" : "text-info"}`}>
                    {pozaOpis(s)}
                    {late && " · po terminie"}
                  </div>
                </div>
              );
            }
            return (
              <div key={s.kod} className="flex flex-col gap-3 rounded-[18px] border border-line bg-card p-3.5">
                <div className="flex items-start gap-3">
                  <KodChip kod={s.kod} tone={h > 24 ? "bad" : "warn"} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold">{s.nazwa}</div>
                    <div className="mt-0.5 text-[13px] text-mute">
                      {mine ? "Ty" : s.ktoMa} · od {fmtDateTime(s.odKiedy)}
                    </div>
                  </div>
                  <span className={`font-mono text-[15px] font-semibold ${h > 24 ? "text-bad" : "text-warn"}`}>{Math.floor(h)} h</span>
                </div>
                {!mine && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="rec" busy={busy === `p:${s.email}`} disabled={!!busy || !s.email} onClick={() => s.email && przypomnij(s.email)}>
                      Przypomnij
                    </Button>
                    <Button busy={busy === `m:${s.kod}`} disabled={!!busy} onClick={() => toJaMam(s)}>
                      To ja mam
                    </Button>
                  </div>
                )}
                {mine && (
                  <Link href={`/skaner?kod=${s.kod}`} className="flex h-11 items-center justify-center rounded-xl bg-ok-bg text-sm font-semibold text-ok">
                    Oddaj
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
