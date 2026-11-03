"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IBox, ICalendar, IChart, IGear, IHistory, IHome, IPeople, IShield, IUser } from "@/components/icons";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Pulpit", Icon: IChart },
  { href: "/admin/rezerwacje", label: "Rezerwacje", Icon: ICalendar },
  { href: "/admin/historia", label: "Historia", Icon: IHistory },
  { href: "/admin/sprzet", label: "Sprzęt", Icon: IBox },
  { href: "/admin/obecnosci", label: "Obecności", Icon: IPeople },
  { href: "/admin/uzytkownicy", label: "Użytkownicy", Icon: IUser },
  { href: "/admin/audyt", label: "Audyt", Icon: IShield },
  { href: "/admin/ustawienia", label: "Ustawienia", Icon: IGear },
];

export function AdminNav({ name }: { name: string }) {
  const path = usePathname();
  return (
    <aside className="no-print border-b border-line bg-bg lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4 font-mono text-xs tracking-[0.14em] text-mute lg:px-5 lg:pt-6">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO · PANEL
      </div>
      <nav aria-label="Panel administratora" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pt-4">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold",
                active ? "bg-card text-ink" : "text-mute hover:text-ink",
              )}
            >
              <Icon size={18} className={active ? "text-rec" : ""} />
              {label}
            </Link>
          );
        })}
        <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm text-mute hover:text-ink lg:mt-6">
          <IHome size={18} /> Aplikacja
        </Link>
      </nav>
      <p className="hidden px-6 text-xs text-mute lg:block">{name}</p>
    </aside>
  );
}
