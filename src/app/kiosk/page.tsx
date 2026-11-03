"use client";

import { useEffect, useState } from "react";
import { QrImage } from "@/components/qr-image";
import { api } from "@/lib/client";

/**
 * Etap 2: tablet przy drzwiach. Kod zmienia się co 30 s, więc zdjęcie kodu nie pozwoli zrobić check-inu z domu.
 * Tablet musi być zalogowany kontem administratora (endpoint /api/admin/kod-drzwi/kiosk).
 */
export default function KioskPage() {
  const [link, setLink] = useState("");
  const [left, setLeft] = useState(30);
  const [err, setErr] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await api<{ link: string; odswiezZa: number }>("/api/admin/kod-drzwi/kiosk");
        setLink(r.link);
        setLeft(r.odswiezZa);
        setErr("");
        timer = setTimeout(load, r.odswiezZa * 1000 + 300);
      } catch (e) {
        setErr((e as Error).message);
        timer = setTimeout(load, 10_000);
      }
    };
    load();
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(t);
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex items-center gap-3 font-mono text-sm tracking-[0.2em] text-mute">
        <span className="h-3 w-3 rounded-full bg-rec shadow-[0_0_0_6px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO
      </div>
      <h1 className="wide text-5xl font-extrabold">Zeskanuj, żeby wejść</h1>
      <div className="rounded-[32px] bg-white p-6">{link ? <QrImage text={link} size={340} label="Kod QR wejścia do studia" /> : <div className="h-[340px] w-[340px]" />}</div>
      <div className="w-[340px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-chip">
          <div className="h-full bg-rec transition-all duration-1000 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
        </div>
        <p className="mt-3 font-mono text-sm text-mute">{err || `nowy kod za ${left} s`}</p>
      </div>
      <p className="max-w-md text-mute">Wychodzisz? Zeskanuj ten sam kod albo kliknij „Wychodzę” w aplikacji.</p>
    </main>
  );
}
