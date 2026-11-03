"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrScanner } from "@/components/qr-scanner";
import { Button, KodChip, ScreenHeader, Skeleton, cx, useToast } from "@/components/ui";
import { IScan } from "@/components/icons";
import { useMe } from "@/components/me";
import { AnimatedNumber } from "@/components/animated-number";
import { haptic } from "@/lib/motion";
import { api, ApiError, fmtTime } from "@/lib/client";
import { parseKod } from "@/lib/qr";
import type { SprzetView } from "@/lib/equipment";

type Filtr = "wszystko" | "brakuje" | "bezqr";
type Res = { lista: SprzetView[]; liczniki: { wszystkie: number; sprawdzone: number } };

export default function InwentaryzacjaPage() {
  const toast = useToast();
  const { me } = useMe();
  const [data, setData] = useState<Res | null>(null);
  const [filtr, setFiltr] = useState<Filtr>("wszystko");
  const [skan, setSkan] = useState(false);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  // Zawsze pobieramy całą listę; filtr działa lokalnie, więc przełączenie nie przesuwa elementów pod palcem.
  const load = useCallback(() => api<Res>("/api/sprzet").then(setData), []);
  useEffect(() => {
    load().catch((e) => toast((e as Error).message, "bad"));
  }, [load, toast]);

  const canManage = me && (!me.inwentaryzacjaTylkoAdmin || me.rola === "admin");

  const setJest = async (kod: number, jest: boolean) => {
    if (pending.has(kod)) return;
    setPending((p) => new Set(p).add(kod));
    try {
      const r = await api<{ pozycja: SprzetView }>(`/api/sprzet/${kod}/jest`, { method: "PATCH", body: { jest } });
      // Zmieniamy tylko ten jeden wiersz — po odpowiedzi serwera.
      setData((d) => {
        if (!d) return d;
        const lista = d.lista.map((s) => (s.kod === kod ? r.pozycja : s));
        return { lista, liczniki: { ...d.liczniki, sprawdzone: lista.filter((s) => s.jest).length } };
      });
      haptic(jest ? "snap" : "tap");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się zapisać.", "bad");
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(kod);
        return n;
      });
    }
  };

  const onScan = (text: string) => {
    const k = parseKod(text);
    const s = k ? data?.lista.find((x) => x.kod === k) : null;
    if (!s) return toast("Nie rozpoznano sprzętu.", "warn");
    if (s.jest) return toast(`${s.nazwa} — już odhaczone.`);
    setJest(s.kod, true).then(() => toast(`Odhaczone: ${s.nazwa}`));
  };

  const start = async () => {
    if (!confirm("Rozpocząć nową inwentaryzację? Wszystkie pozycje zostaną oznaczone jako niesprawdzone.")) return;
    setBusy("start");
    try {
      const r = await api<{ zmienione: number }>("/api/inwentaryzacja/start", { method: "POST" });
      toast(`Inwentaryzacja rozpoczęta (${r.zmienione} pozycji do sprawdzenia).`);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const braki = async () => {
    setBusy("braki");
    try {
      const r = await api<{ braki: number; osoby: number }>("/api/inwentaryzacja/przypomnienia", { method: "POST" });
      toast(r.braki ? `Wysłano: ${r.osoby} os. z wypożyczonym sprzętem + podsumowanie (${r.braki} braków).` : "Brak braków — wszystko odhaczone.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    if (!data) return [];
    if (filtr === "brakuje") return data.lista.filter((s) => !s.jest);
    if (filtr === "bezqr") return data.lista.filter((s) => !s.maQr);
    return data.lista;
  }, [data, filtr]);

  const done = data?.liczniki.sprawdzone ?? 0;
  const all = data?.liczniki.wszystkie ?? 0;

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Inwentaryzacja" back="/wypozyczone" />
      <div className="flex flex-col gap-3 px-5 pt-2">
        <div className="rounded-[18px] border border-line bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[28px] font-semibold">
              <AnimatedNumber value={done} /> <span className="text-mute">/ {all}</span>
            </span>
            <span className="text-[13px] text-mute">sprawdzone</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-chip" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={all}>
            <div className="h-full rounded-full bg-ok transition-[width] duration-500 ease-[var(--ease-spring)]" style={{ width: all ? `${(done / all) * 100}%` : "0%" }} />
          </div>
        </div>

        {skan ? (
          <div className="flex flex-col gap-2">
            <QrScanner onScan={onScan} hint="Skanuj kolejne naklejki — każda zostanie odhaczona" label="ODHACZ" />
            <Button onClick={() => setSkan(false)}>Zakończ skanowanie</Button>
          </div>
        ) : (
          <Button variant="rec" onClick={() => setSkan(true)} className="h-14 rounded-2xl text-[17px]">
            <IScan /> Skanuj i odhacz
          </Button>
        )}

        <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-line bg-card p-1" role="tablist" aria-label="Filtr">
          {(["wszystko", "brakuje", "bezqr"] as Filtr[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filtr === f}
              onClick={() => setFiltr(f)}
              className={cx("min-h-10 rounded-[10px] text-sm font-semibold", filtr === f ? "bg-chip text-ink" : "text-mute")}
            >
              {f === "wszystko" ? "Wszystko" : f === "brakuje" ? `Brakuje${data ? ` (${all - done})` : ""}` : "Bez QR"}
            </button>
          ))}
        </div>

        {!data ? (
          <Skeleton rows={6} />
        ) : (
          <ul className="stagger flex flex-col gap-1.5">
            {shown.map((s) => (
              <li key={s.kod} className="flex items-center gap-3 rounded-[14px] border border-line bg-card py-2 pl-3 pr-2">
                <KodChip kod={s.kod} tone={s.jest ? "ok" : s.status === "poza_szkola" ? "info" : s.status === "wypozyczony" ? "warn" : "mute"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.nazwa}</div>
                  <div className="text-xs text-mute">
                    {s.status === "poza_szkola" ? `poza szkołą · ${s.ktoMa}` : s.status === "wypozyczony" ? `wypożyczony · ${s.ktoMa}` : s.jest && s.sprawdzono ? `sprawdzono ${fmtTime(s.sprawdzono)}` : s.kategoria}
                  </div>
                </div>
                {/* Przełącznik reaguje tylko na kliknięcie i czeka na serwer. */}
                <button
                  role="switch"
                  aria-checked={s.jest}
                  aria-label={`${s.nazwa}: ${s.jest ? "jest" : "brak"}`}
                  disabled={pending.has(s.kod)}
                  onClick={() => setJest(s.kod, !s.jest)}
                  className="flex h-11 w-16 items-center justify-center disabled:opacity-50"
                >
                  <span className={cx("relative h-7 w-12 rounded-full transition-colors duration-300", s.jest ? "bg-ok" : "bg-line-2")}>
                    <span
                      className={cx(
                        "absolute left-1 top-1 h-5 w-5 rounded-full bg-bg shadow transition-transform duration-500 ease-[var(--ease-spring)]",
                        s.jest && "translate-x-5",
                        pending.has(s.kod) && "scale-90",
                      )}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-2 grid grid-cols-1 gap-2 border-t border-line pt-4">
            <Button onClick={braki} busy={busy === "braki"} disabled={!!busy}>
              Wyślij przypomnienia o brakach
            </Button>
            <Button variant="danger" onClick={start} busy={busy === "start"} disabled={!!busy}>
              Rozpocznij nową inwentaryzację
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
