"use client";

import { useEffect, useRef } from "react";
import { spring, type SpringHandle } from "@/lib/motion";

/** Liczba dojeżdża do nowej wartości sprężyną (bez odbicia), więc zmianę widać, a nie tylko ją przeczytać. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const cur = useRef(0);
  const anim = useRef<SpringHandle | null>(null);

  useEffect(() => {
    anim.current?.stop();
    anim.current = spring(cur.current, value, {
      response: 0.6,
      precision: 0.01,
      velocity: anim.current?.velocity() ?? 0,
      onUpdate: (x) => {
        cur.current = x;
        if (el.current) el.current.textContent = String(Math.round(x));
      },
    });
    return () => anim.current?.stop();
  }, [value]);

  return (
    <span ref={el} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      0
    </span>
  );
}
