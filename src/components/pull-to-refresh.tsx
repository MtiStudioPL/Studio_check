"use client";

import { useEffect, useRef, useState } from "react";
import { haptic, rubberband, spring, type SpringHandle } from "@/lib/motion";

const TRIGGER = 72;

/**
 * „Pociągnij, aby odświeżyć” — tylko w aplikacji dodanej do ekranu głównego, bo w przeglądarce
 * Safari i Chrome mają własny gest i dwa naraz by się gryzły.
 * Rusza wyłącznie od samej góry strony i przy ruchu wyraźnie w dół; arkusze i pola ([data-no-ptr]) są pomijane.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
  const [enabled, setEnabled] = useState(false);
  const ind = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const pull = useRef(0);
  const anim = useRef<SpringHandle | null>(null);
  const busy = useRef(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    setEnabled(matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const paint = (p: number) => {
      pull.current = p;
      const el = ind.current;
      if (!el) return;
      const t = Math.min(1, p / TRIGGER);
      el.style.transform = `translate3d(-50%, ${p - 44}px, 0) scale(${0.6 + 0.4 * t})`;
      el.style.opacity = String(t);
      if (arrow.current && !busy.current) arrow.current.style.transform = `rotate(${t * 180}deg)`;
      // Treść zjeżdża razem z palcem (wolniej niż wskaźnik); nawigacja i komunikaty stoją.
      const content = document.querySelector<HTMLElement>("[data-ptr-content]");
      if (content) content.style.transform = p > 0 ? `translate3d(0, ${p * 0.5}px, 0)` : "";
    };
    let start: { y: number; x: number } | null = null;
    let active = false;
    let armed = false;

    const ts = (e: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || (e.target as HTMLElement).closest?.("[data-no-ptr], input, textarea, select")) return;
      anim.current?.stop();
      // Złapanie w trakcie powrotu: kontynuujemy od tego, co widać.
      start = { y: e.touches[0].clientY - pull.current / 0.55, x: e.touches[0].clientX };
      active = false;
    };
    const tm = (e: TouchEvent) => {
      if (!start) return;
      const dy = e.touches[0].clientY - start.y;
      const dx = e.touches[0].clientX - start.x;
      if (!active) {
        if (dy < 8 || Math.abs(dx) > dy) {
          if (Math.abs(dx) > 8 || dy < -4) start = null;
          return;
        }
        active = true;
      }
      if (e.cancelable) e.preventDefault();
      const p = Math.max(0, rubberband(dy, 260, 0.55));
      if (!armed && p >= TRIGGER) haptic("snap");
      armed = p >= TRIGGER;
      paint(p);
    };
    const te = async () => {
      if (!start) return;
      start = null;
      if (!active) return;
      active = false;
      if (armed) {
        armed = false;
        busy.current = true;
        ind.current?.classList.add("ptr-spin");
        anim.current = spring(pull.current, TRIGGER * 0.8, { onUpdate: paint });
        const t0 = Date.now();
        try {
          await cb.current();
        } finally {
          // Minimum pół sekundy kręcenia — inaczej odświeżenie wygląda na niezadziałane.
          await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - t0))));
          ind.current?.classList.remove("ptr-spin");
          busy.current = false;
        }
      }
      anim.current?.stop();
      anim.current = spring(pull.current, 0, { onUpdate: paint });
    };
    document.addEventListener("touchstart", ts, { passive: true });
    document.addEventListener("touchmove", tm, { passive: false });
    document.addEventListener("touchend", te);
    document.addEventListener("touchcancel", te);
    return () => {
      document.removeEventListener("touchstart", ts);
      document.removeEventListener("touchmove", tm);
      document.removeEventListener("touchend", te);
      document.removeEventListener("touchcancel", te);
      const content = document.querySelector<HTMLElement>("[data-ptr-content]");
      if (content) content.style.transform = "";
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      ref={ind}
      aria-hidden
      className="pointer-events-none fixed left-1/2 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card text-rec shadow-xl"
      style={{ top: "env(safe-area-inset-top)", opacity: 0, transform: "translate3d(-50%, -44px, 0)" }}
    >
      <span ref={arrow} className="block">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </span>
    </div>
  );
}
