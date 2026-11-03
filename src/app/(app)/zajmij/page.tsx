"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Empty, KodChip, ScreenHeader, Skeleton, cx, useToast } from "@/components/ui";
import { ISearch } from "@/components/icons";
import { api, ApiError, fmtDateTime, fmtTime } from "@/lib/client";
import { haptic } from "@/lib/motion";

type Stan = "wolny" | "zajety" | "oczekuje" | "poza_szkola" | "wypozyczony";
type Dost = { kod: number; nazwa: string; kategoria: string; stan: Stan; opis: string | null };
type Rez = { id: number; od: string; do: string; cel: string | null; status: string; powod: string | null; pozycje: { kod: number; nazwa: string }[] };

const STAN: Record<Stan, { label: string; cls: string }> = {
  wolny: { label: "Wolny", cls: "bg-ok-bg text-ok" },
  zajety: { label: "Zajęty", cls: "bg-bad-bg text-bad" },
  oczekuje: { label: "Inne wnioski", cls: "bg-warn-bg text-warn" },
  poza_szkola: { label: "Poza szkołą", cls: "bg-info-bg text-info" },
  wypozyczony: { label: "Teraz u kogoś", cls: "bg-warn-bg text-warn" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  oczekuje: { label: "Czeka na decyzję", cls: "bg-warn-bg text-warn" },
  zatwierdzona: { label: "Zatwierdzona", cls: "bg-ok-bg text-ok" },
  odrzucona: { label: "Odrzucona", cls: "bg-bad-bg text-bad" },
  anulowana: { label: "Anulowana", cls: "bg-chip text-mute" },
  wygasla: { label: "Wygasła", cls: "bg-chip text-mute" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function Page() {
  return (
    <Suspense>
      <Zajmij />
    </Suspense>
  );
}

function Zajmij() {
  const toast = useToast();
  const sp = useSearchParams();
  const start = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }, []);
  const [dOd, setDOd] = useState(localDate(start));
  const [tOd, setTOd] = useState(localTime(start));
  const [dDo, setDDo] = useState(localDate(start));
  const [tDo, setTDo] = useState(localTime(new Date(start.getTime() + 2 * 3_600_000)));
  const [cel, setCel] = useState("");
  const [q, setQ] = useState("");
  const [wybrane, setWybrane] = useState<Set<number>>(() => {
    const k = Number(sp.get("kod"));
    return new Set(Number.isInteger(k) && k > 0 ? [k] : []);
  });
  const [dost, setDost] = useState<Dost[] | null>(null);
  const [blad, setBlad] = useState("");
  const [moje, setMoje] = useState<Rez[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const od = useMemo(() => new Date(`${dOd}T${tOd}`), [dOd, tOd]);
  const doo = useMemo(() => new Date(`${dDo}T${tDo}`), [dDo, tDo]);

  // Gdy zmienia się początek, przesuń koniec, żeby nie był przed nim.
  const setStartDate = (v: string) => {
    if (dDo < v || dDo === dOd) setDDo(v);
    setDOd(v);
  };

  useEffect(() => {
    if (isNaN(od.getTime()) || isNaN(doo.getTime()) || doo <= od) {
      setDost(null);
      setBlad(doo <= od ? "Koniec musi być po początku." : "");
      return;
    }
    setBlad("");
    const t = setTimeout(() => {
      api<{ dostepnosc: Dost[] }>(`/api/rezerwacje/dostepnosc?od=${encodeURIComponent(od.toISOString())}&do=${encodeURIComponent(doo.toISOString())}`)
        .then((r) => setDost(r.dostepnosc))
        .catch((e) => setBlad(e instanceof ApiError ? e.message : "Nie udało się sprawdzić dostępności."));
    }, 250);
    return () => clearTimeout(t);
  }, [od, doo]);

  const loadMoje = useCallback(() => api<{ rezerwacje: Rez[] }>("/api/rezerwacje").then((r) => setMoje(r.rezerwacje)), []);
  useEffect(() => {
    loadMoje().catch(() => {});
  }, [loadMoje]);

  const toggle = (k: number) => {
    haptic("tap");
    setWybrane((w) => {
      const n = new Set(w);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const shown = useMemo(() => {
    if (!dost) return [];
    const t = q.trim().toLowerCase();
    const list = t ? dost.filter((d) => d.nazwa.toLowerCase().includes(t) || d.kategoria.toLowerCase().includes(t) || String(d.kod) === t) : dost;
    // wybrane na górze
    return [...list].sort((a, b) => Number(wybrane.has(b.kod)) - Number(wybrane.has(a.kod)));
  }, [dost, q, wybrane]);

  const wybraneZajete = dost?.filter((d) => wybrane.has(d.kod) && d.stan === "zajety") ?? [];

  const wyslij = async () => {
    setBusy("wyslij");
    try {
      await api("/api/rezerwacje", { method: "POST", body: { od: od.toISOString(), do: doo.toISOString(), kody: [...wybrane], cel: cel.trim() || null } });
      toast("Wysłano do administratora. Dostaniesz maila z decyzją.");
      setWybrane(new Set());
      setCel("");
      loadMoje();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się wysłać.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const anuluj = async (r: Rez) => {
    if (!confirm("Anulować tę rezerwację?")) return;
    setBusy(`a${r.id}`);
    try {
      await api(`/api/rezerwacje/${r.id}/anuluj`, { method: "POST" });
      toast("Anulowano.");
      loadMoje();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col">
      <ScreenHeader title="Zajmij sprzęt" />
      <div className={cx("flex flex-col gap-4 px-5 pt-2", wybrane.size > 0 && "pb-36")}>
        <p className="text-[13px] text-mute">Wybierz termin i sprzęt. Wniosek trafia do administratora, który go zatwierdza albo odrzuca.</p>

        <div className="grid grid-cols-2 gap-3 rounded-[18px] border border-line bg-card p-4">
          <label className="flex flex-col gap-1 text-xs text-mute">
            Od — dzień
            <input type="date" value={dOd} min={localDate(new Date())} onChange={(e) => setStartDate(e.target.value)} className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            godzina
            <input type="time" value={tOd} step={900} onChange={(e) => setTOd(e.target.value)} className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Do — dzień
            <input type="date" value={dDo} min={dOd} onChange={(e) => setDDo(e.target.value)} className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            godzina
            <input type="time" value={tDo} step={900} onChange={(e) => setTDo(e.target.value)} className="inp" />
          </label>
          {blad && <p className="col-span-2 text-sm font-semibold text-bad">{blad}</p>}
        </div>

        <div className="flex h-12 items-center gap-2.5 rounded-[14px] border border-line bg-card px-3.5">
          <ISearch size={18} className="text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj sprzętu" aria-label="Szukaj sprzętu" className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute/70" />
        </div>

        {!dost ? (
          blad ? null : <Skeleton rows={5} />
        ) : (
          <ul className="stagger flex flex-col gap-1.5">
            {shown.map((d) => {
              const on = wybrane.has(d.kod);
              const disabled = d.stan === "zajety" && !on;
              return (
                <li key={d.kod}>
                  <label className={cx("press-soft flex min-h-14 items-center gap-3 rounded-[14px] border bg-card px-3 py-2.5 transition-colors duration-200", on ? "border-rec bg-rec/[0.06]" : "border-line", disabled && "opacity-60")}>
                    <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(d.kod)} className="h-5 w-5 shrink-0 accent-[#FF5533]" />
                    <KodChip kod={d.kod} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{d.nazwa}</span>
                      {d.opis && <span className="block truncate text-xs text-mute">{d.opis}</span>}
                    </span>
                    <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STAN[d.stan].cls)}>{STAN[d.stan].label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <section className="mt-2 flex flex-col gap-2">
          <h2 className="label">Moje rezerwacje</h2>
          {!moje ? (
            <Skeleton rows={2} />
          ) : moje.length === 0 ? (
            <Empty>Nie masz jeszcze rezerwacji.</Empty>
          ) : (
            moje.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {fmtDateTime(r.od)} – {r.od.slice(0, 10) === r.do.slice(0, 10) ? fmtTime(r.do) : fmtDateTime(r.do)}
                    </div>
                    <div className="mt-0.5 text-xs text-mute">{r.pozycje.map((p) => p.nazwa).join(", ")}</div>
                    {r.powod && <div className="mt-1 text-xs text-ink/80">Administrator: „{r.powod}”</div>}
                  </div>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[r.status]?.cls)}>{STATUS[r.status]?.label ?? r.status}</span>
                </div>
                {(r.status === "oczekuje" || r.status === "zatwierdzona") && new Date(r.do) > new Date() && (
                  <Button className="min-h-10 self-start px-3 text-sm" busy={busy === `a${r.id}`} onClick={() => anuluj(r)}>
                    Anuluj
                  </Button>
                )}
              </div>
            ))
          )}
        </section>
      </div>

      {wybrane.size > 0 && (
        <div
          className="material slide-up fixed inset-x-0 z-30 mx-auto flex max-w-md flex-col gap-2 rounded-t-[22px] border-t border-line px-5 py-3 shadow-[0_-16px_40px_rgba(0,0,0,0.5)]"
          style={{ bottom: "max(var(--nav-h), var(--kb))" }}
        >
          <input value={cel} onChange={(e) => setCel(e.target.value)} maxLength={500} placeholder="Do czego? np. nagranie wywiadu (opcjonalnie)" aria-label="Cel rezerwacji" className="inp" />
          <Button variant="rec" onClick={wyslij} busy={busy === "wyslij"} disabled={!!blad || wybraneZajete.length > 0} className="h-12 rounded-2xl">
            {wybraneZajete.length ? `Zajęte: ${wybraneZajete.map((z) => z.nazwa).join(", ")}` : `Zajmij ${wybrane.size} szt. · wyślij do administratora`}
          </Button>
        </div>
      )}
    </div>
  );
}
