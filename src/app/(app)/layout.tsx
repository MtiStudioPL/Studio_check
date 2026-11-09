"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MeProvider, useMe } from "@/components/me";
import { IBox, ICalendar, IClipboard, IHome, IPeople, IScan, IShield } from "@/components/icons";
import { logoutAction } from "../actions";
import { PageTransition } from "@/components/page-transition";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { cx } from "@/components/ui";
import { haptic } from "@/lib/motion";

const NAV = [
  { href: "/", label: "Start", Icon: IHome },
  { href: "/skaner", label: "Skanuj", Icon: IScan },
  { href: "/wypozyczone", label: "Sprzęt", Icon: IBox },
  { href: "/obecnosc", label: "Obecność", Icon: IPeople },
];

/** Na komputerze zamiast dolnej nawigacji jest menu z boku — z pozycjami, które na telefonie są pod przyciskami na Starcie. */
const SIDE = [
  { href: "/", label: "Start", Icon: IHome },
  { href: "/skaner", label: "Skanuj", Icon: IScan },
  { href: "/wypozyczone", label: "Sprzęt", Icon: IBox },
  { href: "/zajmij", label: "Zajmij", Icon: ICalendar },
  { href: "/inwentaryzacja", label: "Inwentaryzacja", Icon: IClipboard },
  { href: "/obecnosc", label: "Obecność", Icon: IPeople },
];

function Sidebar({ path }: { path: string }) {
  const { me } = useMe();
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-bg lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-2 pt-6 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO
      </div>
      <nav aria-label="Nawigacja" className="flex flex-col gap-1 px-3 pt-4">
        {SIDE.filter(({ href }) => href !== "/inwentaryzacja" || me?.rola === "admin").map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cx("press flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold", on ? "bg-card text-ink" : "text-mute hover:text-ink")}
            >
              <Icon size={18} className={on ? "text-rec" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-line px-3 py-4">
        {me && <p className="truncate px-3 pb-1 text-xs text-mute">{me.imie}</p>}
        {me?.rola === "admin" && (
          <Link href="/admin" className="press flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-mute hover:text-ink">
            <IShield size={18} /> Panel administratora
          </Link>
        )}
        <Link href="/prywatnosc" className="flex min-h-11 items-center rounded-xl px-3 text-sm text-mute hover:text-ink">
          Twoje dane w aplikacji
        </Link>
        <form action={logoutAction}>
          <button className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-bad hover:bg-chip">Wyloguj</button>
        </form>
      </div>
    </aside>
  );
}

const activeIndex = (path: string) =>
  NAV.findIndex(({ href }) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/wypozyczone" && path === "/inwentaryzacja")));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <Shell>{children}</Shell>
    </MeProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { reload } = useMe();
  const [refresh, setRefresh] = useState(0);
  const hideNav = path === "/c" || path === "/wyjscie";
  const active = activeIndex(path);

  return (
    <div className={cx("mx-auto flex min-h-dvh w-full max-w-md flex-col", !hideNav && "lg:max-w-none lg:flex-row")}>
      <PullToRefresh
        onRefresh={async () => {
          setRefresh((n) => n + 1);
          await reload();
        }}
      />
      {!hideNav && <Sidebar path={path} />}
      <main data-ptr-content className="flex-1 lg:min-w-0" style={hideNav ? undefined : { paddingBottom: "calc(var(--nav-h) + 16px)" }}>
        <div className={cx(!hideNav && "lg:mx-auto lg:max-w-5xl lg:pt-4")}>
          <PageTransition order={NAV.map((n) => n.href)} refreshKey={refresh}>
            {children}
          </PageTransition>
        </div>
      </main>
      {!hideNav && (
        <nav
          aria-label="Nawigacja"
          className="material fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/[0.06] px-3 pt-2 lg:hidden"
          style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
        >
          <div className="relative grid grid-cols-4">
            {/* Wskaźnik przesuwa się sprężyście między zakładkami — widać, skąd i dokąd się poszło. */}
            {active >= 0 && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/4 px-2 transition-transform duration-500 ease-[var(--ease-spring)] motion-reduce:transition-none"
                style={{ transform: `translate3d(${active * 100}%, 0, 0)` }}
              >
                <span className="block h-full rounded-2xl bg-rec/[0.12]" />
              </span>
            )}
            {NAV.map(({ href, label, Icon }, i) => {
              const on = i === active;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  onClick={() => !on && haptic("tap")}
                  className={cx(
                    "press relative flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-300",
                    on ? "text-rec" : "text-mute",
                  )}
                >
                  <Icon className={cx("transition-transform duration-500 ease-[var(--ease-spring)]", on && "-translate-y-px scale-110")} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
