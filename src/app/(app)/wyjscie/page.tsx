"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, KodChip, useToast } from "@/components/ui";
import { IAlert, IExit } from "@/components/icons";
import { useMe } from "@/components/me";
import { api, ApiError, fmtClock, fmtTime } from "@/lib/client";
import type { SprzetView } from "@/lib/equipment";

type Res = { wymagaPotwierdzenia: boolean; sprzet: SprzetView[]; wizyta: { wejscie: string; wyjscie: string | null } };

export default function Page() {
  return (
    <Suspense>
      <Wyjscie />
    </Suspense>
  );
}

function Wyjscie() {
  const zrodlo = useSearchParams().get("zrodlo") === "kod_drzwi" ? "kod_drzwi" : "aplikacja";
  const router = useRouter();
  const toast = useToast();
  const { me, reload } = useMe();
  const [busy, setBusy] = useState(false);
  const [sprzet, setSprzet] = useState<SprzetView[] | null>(null);

  const wyjdz = async (potwierdzam: boolean) => {
    setBusy(true);
    try {
      const r = await api<Res>("/api/obecnosc/checkout", { method: "POST", body: { potwierdzam, zrodlo } });
      if (r.wymagaPotwierdzenia) {
        setSprzet(r.sprzet);
        return;
      }
      toast(r.sprzet.length ? `Do zobaczenia! Masz przy sobie ${r.sprzet.length} szt.` : "Do zobaczenia!");
      await reload();
      router.replace("/");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się zapisać wyjścia.", "bad");
      if (e instanceof ApiError && e.code === "brak_wizyty") {
        await reload();
        router.replace("/");
      }
    } finally {
      setBusy(false);
    }
  };

  const w = me?.wizyta;

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-8">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO · WYJŚCIE
      </div>
      <div className="flex flex-1 flex-col justify-center gap-6">
        {!me ? (
          <div className="h-40 animate-pulse rounded-3xl bg-card" />
        ) : !w ? (
          <>
            <h1 className="wide text-3xl font-extrabold">Nie masz otwartej wizyty</h1>
            <Link href="/" className="flex h-14 items-center justify-center rounded-2xl border border-line-2 font-semibold">
              Wróć na start
            </Link>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="label">W studiu od {fmtTime(w.wejscie)}</span>
              <div className="font-mono text-[44px] font-semibold leading-none">{fmtClock(Date.now() - new Date(w.wejscie).getTime())}</div>
            </div>

            {sprzet && sprzet.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-[22px] border border-warn/30 bg-warn-bg/40 p-4">
                <div className="flex items-center gap-2 font-semibold text-warn">
                  <IAlert size={20} /> Masz u siebie {sprzet.length} szt.
                </div>
                <ul className="flex flex-col gap-1.5">
                  {sprzet.map((s) => (
                    <li key={s.kod} className="flex items-center gap-3 rounded-xl bg-card px-3 py-2">
                      <KodChip kod={s.kod} tone="warn" />
                      <span className="text-sm font-semibold">{s.nazwa}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/skaner?kod=${sprzet[0].kod}`} className="flex h-12 items-center justify-center rounded-xl bg-ok text-[15px] font-extrabold text-bg">
                    Oddaj teraz
                  </Link>
                  <Button onClick={() => wyjdz(true)} busy={busy}>
                    Zabieram, wychodzę
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="rec" onClick={() => wyjdz(false)} busy={busy} className="h-16 rounded-2xl text-lg">
                <IExit /> Wychodzę ze studia
              </Button>
            )}
            <Link href="/" className="text-center text-sm text-mute underline underline-offset-4">
              Zostaję
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
