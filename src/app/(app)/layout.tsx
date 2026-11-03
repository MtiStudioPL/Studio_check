"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MeProvider, useMe } from "@/components/me";
import { IBox, IHome, IPeople, IScan } from "@/components/icons";
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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <PullToRefresh
        onRefresh={async () => {
          setRefresh((n) => n + 1);
          await reload();
        }}
      />
      <main data-ptr-content className="flex-1" style={hideNav ? undefined : { paddingBottom: "calc(var(--nav-h) + 16px)" }}>
        <PageTransition order={NAV.map((n) => n.href)} refreshKey={refresh}>
          {children}
        </PageTransition>
      </main>
      {!hideNav && (
        <nav
          aria-label="Nawigacja"
          className="material fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-white/[0.06] px-3 pt-2"
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
