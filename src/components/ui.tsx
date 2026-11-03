"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { IBack } from "./icons";
import { haptic, project, rubberband, spring, velocityTracker, type SpringHandle } from "@/lib/motion";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function initialsFrom(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[18px] border border-line bg-card", className)}>{children}</div>;
}

export function KodChip({ kod, tone = "mute" }: { kod: number | null; tone?: "mute" | "warn" | "ok" | "bad" | "info" }) {
  const color = { mute: "text-mute", warn: "text-warn", ok: "text-ok", bad: "text-bad", info: "text-info" }[tone];
  return (
    <span className={cx("shrink-0 rounded-lg bg-chip px-2 py-1 font-mono text-xs font-semibold", color)}>
      {kod == null ? "—" : String(kod).padStart(3, "0")}
    </span>
  );
}

export function StatusPill({ status, over24 }: { status: string; over24?: boolean }) {
  if (status === "poza_szkola") return <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-[13px] font-semibold text-info">Poza szkołą</span>;
  if (status === "wypozyczony")
    return (
      <span className={cx("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", over24 ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn")}>
        Wypożyczony
      </span>
    );
  return <span className="rounded-full bg-ok-bg px-2.5 py-0.5 text-[13px] font-semibold text-ok">W studiu</span>;
}

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "rec" | "ok" | "ghost" | "soft-ok" | "danger";
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  type?: "button" | "submit";
  "aria-label"?: string;
};

export function Button({ children, onClick, variant = "ghost", disabled, busy, className, type = "button", ...rest }: BtnProps) {
  const v = {
    rec: "bg-rec text-bg font-extrabold",
    ok: "bg-ok text-bg font-extrabold",
    ghost: "border border-line-2 bg-transparent text-ink font-semibold",
    "soft-ok": "bg-ok-bg text-ok font-semibold",
    danger: "bg-bad-bg text-bad font-semibold border border-bad/30",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={rest["aria-label"]}
      className={cx("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] transition active:scale-[0.98] disabled:opacity-50", v, className)}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ScreenHeader({ title, back = "/", right }: { title: string; back?: string | null; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-1 px-3 pb-1 pt-3.5">
      {back ? (
        <Link href={back} aria-label="Wstecz" className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink">
          <IBack />
        </Link>
      ) : null}
      <h1 className={cx("wide min-w-0 truncate text-[22px] font-extrabold", !back && "pl-2")}>{title}</h1>
      <div className="ml-auto shrink-0">{right}</div>
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-sm text-mute">{children}</p>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-[14px] bg-card" />
      ))}
    </div>
  );
}

// ---------- komunikaty ----------
type Toast = { id: number; text: string; tone: "ok" | "warn" | "bad" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    // Haptyka w tej samej klatce, w której pojawia się komunikat — wynik czuć, zanim się go przeczyta.
    haptic(tone === "ok" ? "success" : tone === "warn" ? "warn" : "error");
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
  }, []);
  const remove = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  return (
    <ToastCtx.Provider value={push}>
      <MotionRoot />
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onGone={remove} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Komunikat wjeżdża sprężyną z góry; można go zsunąć palcem w górę albo w bok.
 * Dotknięcie wstrzymuje odliczanie, więc dłuższy błąd da się spokojnie przeczytać.
 */
function ToastItem({ toast: t, onGone }: { toast: Toast; onGone: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: -28, o: 0 });
  const anims = useRef<SpringHandle[]>([]);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; axis: "x" | "y" | null } | null>(null);
  const vx = useRef(velocityTracker());
  const vy = useRef(velocityTracker());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gone = useRef(false);

  const paint = useCallback(() => {
    const { x, y, o } = pos.current;
    if (el.current) {
      el.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.96 + 0.04 * o})`;
      el.current.style.opacity = String(o);
    }
  }, []);

  const animate = useCallback(
    (to: { x: number; y: number; o: number }, v = { x: 0, y: 0 }, done?: () => void, damping = 1) => {
      anims.current.forEach((a) => a.stop());
      let left = 3;
      const fin = () => --left === 0 && done?.();
      anims.current = [
        spring(pos.current.x, to.x, { velocity: v.x, damping, response: 0.38, onUpdate: (x) => ((pos.current.x = x), paint()), onDone: fin }),
        spring(pos.current.y, to.y, { velocity: v.y, damping, response: 0.38, onUpdate: (y) => ((pos.current.y = y), paint()), onDone: fin }),
        spring(pos.current.o, to.o, { response: 0.3, precision: 0.002, onUpdate: (o) => ((pos.current.o = o), paint()), onDone: fin }),
      ];
    },
    [paint],
  );

  const dismiss = useCallback(
    (v = { x: 0, y: 0 }) => {
      if (gone.current) return;
      gone.current = true;
      clearTimeout(timer.current);
      const w = el.current?.offsetWidth ?? 320;
      const sideways = Math.abs(pos.current.x) > Math.abs(pos.current.y) + 4 || Math.abs(v.x) > Math.abs(v.y);
      const to = sideways ? { x: Math.sign(pos.current.x || v.x || 1) * (w + 40), y: pos.current.y, o: 0 } : { x: pos.current.x, y: -80, o: 0 };
      animate(to, v, () => onGone(t.id));
    },
    [animate, onGone, t.id],
  );

  const arm = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismiss(), t.tone === "ok" ? 3500 : 7000);
  }, [dismiss, t.tone]);

  useEffect(() => {
    paint();
    animate({ x: 0, y: 0, o: 1 }, { x: 0, y: 0 }, undefined, 0.85);
    arm();
    return () => {
      clearTimeout(timer.current);
      anims.current.forEach((a) => a.stop());
    };
  }, [animate, arm, paint]);

  const onDown = (e: React.PointerEvent) => {
    if (gone.current) return;
    clearTimeout(timer.current);
    anims.current.forEach((a) => a.stop());
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.current.x, oy: pos.current.y, axis: null };
    vx.current.reset();
    vy.current.reset();
    el.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.axis && Math.hypot(dx, dy) > 6) d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    vx.current.add(e.clientX);
    vy.current.add(e.clientY);
    if (d.axis === "x") pos.current.x = d.ox + dx;
    // W dół komunikat stawia opór — nie ma tam dokąd iść.
    if (d.axis === "y") pos.current.y = dy < 0 ? d.oy + dy : rubberband(dy, 120);
    paint();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const v = { x: vx.current.get(), y: vy.current.get() };
    const w = el.current?.offsetWidth ?? 320;
    const endX = pos.current.x + project(v.x, 0.99);
    const endY = pos.current.y + project(v.y, 0.99);
    if (Math.abs(endX) > w * 0.45 || endY < -40) dismiss(v);
    else {
      animate({ x: 0, y: 0, o: 1 }, v, undefined, 0.8);
      arm();
    }
  };

  return (
    <div
      ref={el}
      role={t.tone === "bad" ? "alert" : "status"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ touchAction: "none", opacity: 0 }}
      className={cx(
        "pointer-events-auto max-w-md cursor-grab select-none rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl will-change-transform",
        t.tone === "ok" && "border-ok/30 bg-ok-bg text-ok",
        t.tone === "warn" && "border-warn/30 bg-warn-bg text-warn",
        t.tone === "bad" && "border-bad/30 bg-bad-bg text-bad",
      )}
    >
      {t.text}
    </div>
  );
}

/**
 * Drobne rzeczy, bez których telefon nie czuje się jak telefon:
 *  - iOS pokazuje :active tylko wtedy, gdy na stronie jest słuchacz touchstart,
 *  - --kb = wysokość klawiatury iOS, żeby dolne panele nie chowały się pod nią,
 *  - klasa standalone, gdy aplikacja jest otwarta z ekranu głównego.
 */
function MotionRoot() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    const vv = window.visualViewport;
    const kb = () => {
      if (!vv) return;
      const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${h > 80 ? h : 0}px`);
    };
    vv?.addEventListener("resize", kb);
    vv?.addEventListener("scroll", kb);
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    document.documentElement.classList.toggle("standalone", standalone);
    return () => {
      document.removeEventListener("touchstart", noop);
      vv?.removeEventListener("resize", kb);
      vv?.removeEventListener("scroll", kb);
    };
  }, []);
  return null;
}

/** Krótki opis sprzętu poza szkołą: „w domu · zwrot do 03.11”. */
export function pozaOpis(s: { miejsce?: string | null; planowanyZwrot?: string | null }) {
  const z = s.planowanyZwrot ? `zwrot do ${s.planowanyZwrot.slice(8, 10)}.${s.planowanyZwrot.slice(5, 7)}` : "bez terminu";
  return [s.miejsce, z].filter(Boolean).join(" · ");
}

export function pozaPoTerminie(s: { status: string; planowanyZwrot?: string | null }) {
  if (s.status !== "poza_szkola" || !s.planowanyZwrot) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  return s.planowanyZwrot < today;
}
