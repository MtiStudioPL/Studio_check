"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "studio.cookies.ok";

/**
 * Informacja o ciasteczkach. Aplikacja używa wyłącznie jednego ciasteczka sesji (niezbędnego do logowania) —
 * bez analityki, reklam i śledzenia, więc nie wymaga zgody, ale informujemy o tym wprost.
 * Zapamiętanie kliknięcia: localStorage (jeśli niedostępne, komunikat po prostu wraca).
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const ok = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* brak dostępu do pamięci przeglądarki */
    }
    setShow(false);
  };
  return (
    <div role="region" aria-label="Informacja o ciasteczkach" className="fixed inset-x-0 bottom-0 z-[60] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-60 lg:flex lg:justify-center">
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-line-2 bg-card p-4 shadow-2xl lg:max-w-2xl lg:flex-row lg:items-center">
        <p className="text-[13px] leading-relaxed text-mute lg:flex-1">
          Ta aplikacja używa tylko jednego, niezbędnego ciasteczka sesji — dzięki niemu zostajesz zalogowany. Nie stosujemy reklam, analityki ani śledzenia.{" "}
          <Link href="/prywatnosc" className="font-semibold text-ink underline underline-offset-2">
            Szczegóły
          </Link>
        </p>
        <button onClick={ok} className="press h-11 shrink-0 rounded-xl bg-rec px-5 text-sm font-extrabold text-bg">
          Rozumiem
        </button>
      </div>
    </div>
  );
}
