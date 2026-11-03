"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui";
import { getRole, handle, resetDemo, setRole } from "@/lib/demo-mock";

/** Pływający przycisk DEMO: rola, symulacja skanu kodu drzwi, reset danych. Tylko w buildzie demo. */
export function DemoBar() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rola, setRola] = useState<"admin" | "uzytkownik">("admin");
  const [door, setDoor] = useState("");

  useEffect(() => {
    setRola(getRole());
    handle("/api/admin/kod-drzwi", "GET", undefined).then((r) => setDoor(new URL((r as { link: string }).link).search));
  }, [open]);

  // Eksporty CSV wymagają serwera — w demo klik tylko wyjaśnia, czemu nic się nie pobiera.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (a?.getAttribute("href")?.startsWith("/api/")) {
        e.preventDefault();
        toast("W wersji demo eksport CSV jest wyłączony.", "warn");
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [toast]);

  return (
    <div className="no-print fixed left-1/2 top-1 z-[60] -translate-x-1/2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full border border-rec/40 bg-bg/90 px-3 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-rec backdrop-blur"
      >
        DEMO
      </button>
      {open && (
        <div className="absolute left-1/2 top-7 flex w-72 -translate-x-1/2 flex-col gap-2 rounded-2xl border border-line bg-card p-3 text-sm shadow-2xl">
          <p className="text-xs text-mute">Dane przykładowe zapisują się tylko w tej przeglądarce.</p>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1" role="group" aria-label="Rola">
            {(["admin", "uzytkownik"] as const).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRole(r);
                  location.reload();
                }}
                aria-pressed={rola === r}
                className={`min-h-9 rounded-lg text-xs font-semibold ${rola === r ? "bg-chip text-ink" : "text-mute"}`}
              >
                {r === "admin" ? "Administrator" : "Użytkownik"}
              </button>
            ))}
          </div>
          <Link href={`/c${door}`} onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-xl border border-line-2 px-3 font-semibold">
            Symuluj skan kodu przy drzwiach
          </Link>
          <Link href="/admin" onClick={() => setOpen(false)} className="flex min-h-10 items-center rounded-xl border border-line-2 px-3 font-semibold">
            Panel administratora
          </Link>
          <button
            onClick={() => {
              if (!confirm("Przywrócić dane przykładowe? Twoje zmiany w demo zostaną usunięte.")) return;
              resetDemo();
              location.reload();
            }}
            className="min-h-10 rounded-xl px-3 text-left font-semibold text-bad"
          >
            Zresetuj dane demo
          </button>
        </div>
      )}
    </div>
  );
}
