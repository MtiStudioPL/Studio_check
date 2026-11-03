"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Ekran wjeżdża z kierunku, w którym się idzie: zakładka w prawo → z prawej, w lewo → z lewej,
 * ekran „w głąb” (spoza zakładek) → lekko od dołu. Krótko i bez blokowania dotyku — animuje tylko nowa treść.
 * `order` to kolejność zakładek; `refreshKey` wymusza ponowne zamontowanie (odświeżenie danych).
 */
export function PageTransition({ order, refreshKey = 0, children }: { order: string[]; refreshKey?: number; children: ReactNode }) {
  const path = usePathname();
  const prev = useRef<{ path: string; i: number } | null>(null);
  const style = useRef<Record<string, string>>({});

  if (prev.current?.path !== path) {
    const idx = (p: string) => {
      let best = -1;
      order.forEach((o, i) => {
        if (o === p || (o !== "/" && o !== order[0] && p.startsWith(o + "/")) || (o === order[0] && p === o)) best = i;
      });
      return best;
    };
    const i = idx(path);
    const from = prev.current?.i ?? -1;
    style.current =
      prev.current == null
        ? { "--dx": "0px", "--dy": "6px" }
        : i >= 0 && from >= 0 && i !== from
          ? { "--dx": `${i > from ? 18 : -18}px`, "--dy": "0px" }
          : { "--dx": "0px", "--dy": "14px" };
    prev.current = { path, i };
  }

  return (
    <div key={`${path}#${refreshKey}`} className="page-in" style={style.current as CSSProperties}>
      {children}
    </div>
  );
}
