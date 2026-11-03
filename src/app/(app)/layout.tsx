"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MeProvider } from "@/components/me";
import { IBox, IHome, IPeople, IScan } from "@/components/icons";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/", label: "Start", Icon: IHome },
  { href: "/skaner", label: "Skanuj", Icon: IScan },
  { href: "/wypozyczone", label: "Sprzęt", Icon: IBox },
  { href: "/obecnosc", label: "Obecność", Icon: IPeople },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hideNav = path === "/c" || path === "/wyjscie";
  return (
    <MeProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <main className={cx("flex-1", !hideNav && "pb-28")}>{children}</main>
        {!hideNav && (
          <nav
            aria-label="Nawigacja"
            className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-md grid-cols-4 border-t border-[#20242B] bg-bg px-3 pt-2"
            style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
          >
            {NAV.map(({ href, label, Icon }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href) || (href === "/wypozyczone" && path === "/inwentaryzacja");
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active ? "text-rec" : "text-mute")}
                >
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </MeProvider>
  );
}
