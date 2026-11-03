"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (text: string) => void;
  paused?: boolean;
  hint?: string;
  label?: string;
};

/**
 * Podgląd aparatu z ramką. html5-qrcode ładowany dopiero w przeglądarce (wymaga HTTPS i zgody na aparat).
 * Ten sam kod ignorowany przez 2,5 s, żeby jedno przyłożenie nie dawało serii zdarzeń.
 */
export function QrScanner({ onScan, paused, hint = "Skieruj aparat na naklejkę QR", label = "SKAN" }: Props) {
  const ref = useRef<{ stop: () => Promise<void>; isScanning: boolean } | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const cb = useRef(onScan);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<"start" | "on" | "off" | "error">("start");
  const [err, setErr] = useState("");
  cb.current = onScan;
  pausedRef.current = paused;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled) return;
        const q = new Html5Qrcode("qr-reader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
        ref.current = q as unknown as { stop: () => Promise<void>; isScanning: boolean };
        await q.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w: number, h: number) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } },
          (text: string) => {
            if (pausedRef.current) return;
            const now = Date.now();
            if (text === last.current.text && now - last.current.at < 2500) return;
            last.current = { text, at: now };
            if (navigator.vibrate) navigator.vibrate(40);
            cb.current(text);
          },
          () => {},
        );
        if (cancelled) await q.stop().catch(() => {});
        else setState("on");
      } catch (e) {
        if (cancelled) return;
        const msg = String((e as Error)?.message ?? e);
        setErr(
          /NotAllowed|Permission/i.test(msg)
            ? "Brak zgody na aparat. Zezwól w ustawieniach przeglądarki albo wybierz sprzęt z listy."
            : /NotFound|no camera/i.test(msg)
              ? "Nie znaleziono aparatu."
              : /secure|https/i.test(msg)
                ? "Aparat działa tylko po HTTPS."
                : "Nie udało się uruchomić aparatu.",
        );
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      const q = ref.current;
      if (q?.isScanning) q.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="relative h-[220px] overflow-hidden rounded-[22px] border border-[#20242B] bg-[#050608]">
      <div id="qr-reader" className="absolute inset-0" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2" aria-hidden>
        <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-[10px] border-l-[3px] border-t-[3px] border-rec" />
        <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-[10px] border-r-[3px] border-t-[3px] border-rec" />
        <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-[10px] border-b-[3px] border-l-[3px] border-rec" />
        <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-[10px] border-b-[3px] border-r-[3px] border-rec" />
        {state === "on" && !paused && (
          <span className="absolute left-3 right-3 top-[74px] h-0.5 animate-pulse bg-rec shadow-[0_0_12px_2px_rgba(255,85,51,0.6)]" />
        )}
      </div>
      <span className="absolute left-3 top-3 flex items-center gap-1.5 font-mono text-[11px] tracking-[0.1em] text-bad">
        <span className={`h-2 w-2 rounded-full ${state === "on" ? "bg-rec" : "bg-line-2"}`} />
        {label}
      </span>
      <span className="absolute inset-x-3 bottom-3 text-center text-xs text-mute">{state === "error" ? err : state === "start" ? "Uruchamiam aparat…" : hint}</span>
    </div>
  );
}
