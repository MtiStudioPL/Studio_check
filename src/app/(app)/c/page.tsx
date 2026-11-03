"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { IEnter, IExit } from "@/components/icons";
import { useMe } from "@/components/me";
import { api, ApiError, fmtTime } from "@/lib/client";

export default function Page() {
  return (
    <Suspense>
      <CheckIn />
    </Suspense>
  );
}

/**
 * Ekran po zeskanowaniu kodu drzwi. Samo otwarcie linku (GET) niczego nie zapisuje —
 * wizyta powstaje dopiero po kliknięciu „Tak, wchodzę” (POST).
 */
function CheckIn() {
  const token = useSearchParams().get("t") ?? "";
  const router = useRouter();
  const toast = useToast();
  const { me, reload } = useMe();
  const [busy, setBusy] = useState(false);
  const [blad, setBlad] = useState("");

  const wejdz = async () => {
    setBusy(true);
    setBlad("");
    try {
      const r = await api<{ juz: boolean; wizyta: { wejscie: string } }>("/api/obecnosc/checkin", { method: "POST", body: { token } });
      toast(r.juz ? `Jesteś w studiu od ${fmtTime(r.wizyta.wejscie)}.` : "Witaj w studiu!");
      await reload();
      router.replace("/");
    } catch (e) {
      setBlad(e instanceof ApiError ? e.message : "Nie udało się zapisać wejścia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-8">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO · WEJŚCIE
      </div>

      <div className="flex flex-1 flex-col justify-center gap-6">
        {!token ? (
          <p className="text-mute">Brak kodu drzwi w linku. Zeskanuj kod QR przy wejściu do studia.</p>
        ) : !me ? (
          <div className="h-40 animate-pulse rounded-3xl bg-card" />
        ) : me.wizyta ? (
          <>
            <h1 className="wide text-[34px] font-extrabold leading-tight">Jesteś w studiu od {fmtTime(me.wizyta.wejscie)}</h1>
            <p className="text-mute">Wychodzisz? Zakończ wizytę.</p>
            <Link href="/wyjscie?zrodlo=kod_drzwi" className="flex h-16 items-center justify-center gap-2 rounded-2xl bg-rec text-lg font-extrabold text-bg">
              <IExit /> Wychodzę
            </Link>
            <Link href="/" className="text-center text-sm text-mute underline underline-offset-4">
              Zostaję — wróć do aplikacji
            </Link>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="label">Wchodzę do studia</span>
              <h1 className="wide text-[34px] font-extrabold leading-tight">{me.imie}</h1>
              <p className="text-mute">{me.email}</p>
            </div>
            {blad && <p role="alert" className="rounded-2xl border border-bad/30 bg-bad-bg p-4 text-sm font-semibold text-bad">{blad}</p>}
            <Button variant="rec" onClick={wejdz} busy={busy} className="h-16 rounded-2xl text-lg">
              <IEnter /> Tak, wchodzę
            </Button>
            <Link href="/" className="text-center text-sm text-mute underline underline-offset-4">
              Nie teraz
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
