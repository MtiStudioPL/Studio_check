"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clamp, haptic, project, rubberband, spring, velocityTracker, type SpringHandle } from "@/lib/motion";
import { cx } from "./ui";
import { IX } from "./icons";

const CloseCtx = createContext<() => void>(() => {});
/** Otwarte arkusze, od najstarszego — Escape zamyka tylko ten na wierzchu. */
const stack: object[] = [];
/** Blokada przewijania liczona, bo arkusze się zagnieżdżają i zamykają w dowolnej kolejności. */
let locks = 0;
let savedOverflow = "";
function lockScroll() {
  if (locks++ === 0) {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
  }
  return () => {
    if (--locks === 0) document.documentElement.style.overflow = savedOverflow;
  };
}
/** Zamyka najbliższy arkusz z animacją (zamiast odmontowania w pół klatki). */
export const useSheetClose = () => useContext(CloseCtx);

export function SheetCloseButton() {
  const close = useSheetClose();
  return (
    <button type="button" onClick={close} aria-label="Zamknij" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-mute">
      <IX />
    </button>
  );
}

/** Szeroki ekran (tablet poziomo, komputer): panel z boku zamiast arkusza od dołu. */
export function useWide(query = "(min-width: 768px)") {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

type Props = {
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** bottom = arkusz od dołu (telefon), right = panel z prawej (komputer). */
  side?: "bottom" | "right";
  /** Bez przyciemnienia i blokady przewijania — arkusz obok treści, np. wybrany sprzęt w Skanerze. */
  modal?: boolean;
  className?: string;
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent) => void;
  /** Sterowanie z zewnątrz: false = zjedź (potem onClose), true w trakcie zjeżdżania = wróć od miejsca, w którym jest. */
  open?: boolean;
};

/**
 * Arkusz jak w iOS: wjeżdża sprężyną, idzie 1:1 za palcem od miejsca chwycenia, rzucony w dół zamyka się
 * z prędkością palca, a w górę stawia opór. Animację można złapać w każdej chwili, także w trakcie zamykania.
 * Przeciąganie startuje z uchwytu albo z treści przewiniętej do samej góry, więc nie przeszkadza w przewijaniu.
 */
export function Sheet({ onClose, label, children, side = "bottom", modal = true, className, as = "div", onSubmit, open }: Props) {
  const panel = useRef<HTMLElement | null>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const pos = useRef(10_000);
  const anim = useRef<SpringHandle | null>(null);
  const closing = useRef(false);
  const vel = useRef(velocityTracker());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const axisY = side === "bottom";

  const size = () => (panel.current ? (axisY ? panel.current.offsetHeight : panel.current.offsetWidth) : 400);

  const paint = useCallback(
    (p: number) => {
      pos.current = p;
      const el = panel.current;
      if (el) el.style.transform = axisY ? `translate3d(0, ${p}px, 0)` : `translate3d(${p}px, 0, 0)`;
      if (scrim.current) scrim.current.style.opacity = String(clamp(1 - p / Math.max(1, size()), 0, 1));
    },
    [axisY],
  );

  const go = useCallback(
    (target: number, velocity = 0, damping = 1, done?: () => void, precision = 0.3) => {
      anim.current?.stop();
      anim.current = spring(pos.current, target, { velocity, damping, response: 0.36, precision, onUpdate: paint, onDone: done });
    },
    [paint],
  );

  const close = useCallback(
    (velocity = 0) => {
      closing.current = true;
      // Za krawędzią ekranu nie widać już ogona sprężyny — kończymy wcześniej.
      go(size() + 24, Math.max(velocity, 0), 1, () => onCloseRef.current(), 4);
    },
    [go],
  );

  useEffect(() => {
    if (open === false && !closing.current) close();
    if (open === true && closing.current) {
      closing.current = false;
      go(0, anim.current?.velocity() ?? 0);
    }
  }, [open, close, go]);

  useLayoutEffect(() => {
    paint(size() + 24);
    go(0, 0, 1);
    return () => anim.current?.stop();
  }, [go, paint]);

  useEffect(() => {
    const me = {};
    stack.push(me);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stack.at(-1) === me && close();
    window.addEventListener("keydown", onKey);
    const prevFocus = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const unlock = modal ? lockScroll() : () => {};
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(me), 1);
      unlock();
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [close, modal]);

  // ---------- gest ----------
  const g = useRef<{ start: number; startPos: number; cross: number; mode: "?" | "drag" | "scroll"; scroller: HTMLElement | null } | null>(null);

  const begin = (main: number, cross: number, target: EventTarget | null) => {
    const scroller = (target as HTMLElement | null)?.closest?.("[data-sheet-scroll]") as HTMLElement | null;
    // Złapanie w locie: startujemy od bieżącej pozycji na ekranie, nie od celu.
    g.current = { start: main, startPos: pos.current, cross, mode: "?", scroller };
    vel.current.reset();
    vel.current.add(main);
  };

  /** Zwraca true, gdy gest należy do arkusza (wtedy przeglądarka nie przewija). */
  const move = (main: number, cross: number, fromHandle: boolean) => {
    const s = g.current;
    if (!s) return false;
    const d = main - s.start;
    if (s.mode === "?") {
      if (Math.abs(d) < 6 && Math.abs(cross - s.cross) < 6) return false;
      const along = Math.abs(d) > Math.abs(cross - s.cross);
      const atTop = !s.scroller || s.scroller.scrollTop <= 0;
      s.mode = along && (fromHandle || (atTop && d > 0) || s.startPos > 1) ? "drag" : "scroll";
      if (s.mode === "drag") {
        anim.current?.stop();
        closing.current = false;
        s.start = main;
        s.startPos = pos.current;
      }
    }
    if (s.mode !== "drag") return false;
    vel.current.add(main);
    const raw = s.startPos + (main - s.start);
    paint(raw < 0 ? rubberband(raw, size()) : raw);
    return true;
  };

  const end = () => {
    const s = g.current;
    g.current = null;
    if (!s || s.mode !== "drag") return;
    const v = vel.current.get();
    const landing = pos.current + project(v);
    // Decyduje kierunek rzutu i miejsce, w którym arkusz by się zatrzymał — nie samo miejsce puszczenia.
    if (landing > size() * 0.5 && v > -100) {
      haptic("snap");
      close(v);
    } else go(0, v, Math.abs(v) > 300 ? 0.8 : 1);
  };

  // Dotyk: zwykłe zdarzenia touch, bo tylko one pozwalają przejąć przesunięcie od przewijania (preventDefault).
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const main = (t: Touch) => (axisY ? t.clientY : t.clientX);
    const crossOf = (t: Touch) => (axisY ? t.clientX : t.clientY);
    const ts = (e: TouchEvent) => e.touches.length === 1 && begin(main(e.touches[0]), crossOf(e.touches[0]), e.target);
    const tm = (e: TouchEvent) => {
      const fromHandle = !!(e.target as HTMLElement).closest?.("[data-sheet-handle]");
      if (move(main(e.touches[0]), crossOf(e.touches[0]), fromHandle) && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  });

  // Mysz: przeciąganie za uchwyt.
  const onHandleDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    begin(axisY ? e.clientY : e.clientX, axisY ? e.clientX : e.clientY, e.target);
  };
  const onHandleMove = (e: React.PointerEvent) => e.pointerType === "mouse" && move(axisY ? e.clientY : e.clientX, axisY ? e.clientX : e.clientY, true);

  const Tag = as;
  const body = (
    <CloseCtx.Provider value={() => close()}>
      <div className={cx("fixed inset-0", modal ? "z-[60]" : "pointer-events-none z-40")} data-no-ptr>
        {modal && <div ref={scrim} className="absolute inset-0 bg-black/55" style={{ opacity: 0 }} onClick={() => close()} aria-hidden />}
        <Tag
          ref={(n: HTMLElement | null) => {
            panel.current = n;
          }}
          role="dialog"
          aria-modal={modal || undefined}
          aria-label={label}
          tabIndex={-1}
          onSubmit={onSubmit}
          className={cx(
            "pointer-events-auto absolute flex flex-col overflow-hidden border-line bg-card outline-none will-change-transform",
            axisY
              ? // Drugi cień w kolorze karty przedłuża arkusz w dół, gdy ciągnie się go ponad krawędź.
                "inset-x-0 mx-auto w-full max-w-md rounded-t-[26px] border-t shadow-[0_-16px_48px_rgba(0,0,0,0.55),0_60vh_0_0_var(--color-card)]"
              : "bottom-0 right-0 top-0 w-full max-w-md border-l shadow-[-16px_0_48px_rgba(0,0,0,0.55)]",
            className,
          )}
          style={
            axisY
              ? { bottom: "var(--kb)", maxHeight: "calc(100dvh - var(--kb) - env(safe-area-inset-top) - 16px)", transform: "translate3d(0, 100vh, 0)" }
              : { transform: "translate3d(100vw, 0, 0)" }
          }
        >
          <div
            data-sheet-handle
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={(e) => e.pointerType === "mouse" && end()}
            className={cx("flex shrink-0 cursor-grab justify-center active:cursor-grabbing", axisY ? "pb-1 pt-2.5" : "absolute inset-y-0 left-0 w-3")}
            style={{ touchAction: "none" }}
            aria-hidden
          >
            {axisY && <span className="h-1 w-10 rounded-full bg-line-2" />}
          </div>
          <div
            data-sheet-scroll
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
            style={axisY ? { paddingBottom: "max(20px, env(safe-area-inset-bottom))" } : undefined}
          >
            {children}
          </div>
        </Tag>
      </div>
    </CloseCtx.Provider>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}
