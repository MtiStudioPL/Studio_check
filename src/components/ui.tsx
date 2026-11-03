"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IBack } from "./icons";

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
        <Link href={back} aria-label="Wstecz" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink">
          <IBack />
        </Link>
      ) : null}
      <h1 className={cx("wide text-[22px] font-extrabold", !back && "pl-2")}>{title}</h1>
      <div className="ml-auto">{right}</div>
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
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "ok" ? 3500 : 7000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "bad" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto max-w-md rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl",
              t.tone === "ok" && "border-ok/30 bg-ok-bg text-ok",
              t.tone === "warn" && "border-warn/30 bg-warn-bg text-warn",
              t.tone === "bad" && "border-bad/30 bg-bad-bg text-bad",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
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
