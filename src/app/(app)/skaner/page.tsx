"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QrScanner } from "@/components/qr-scanner";
import { PozaSzkolaDialog } from "@/components/poza-szkola-dialog";
import { Button, ScreenHeader, Skeleton, StatusPill, pozaOpis, useToast } from "@/components/ui";
import { IEnter, ISearch, IX } from "@/components/icons";
import { useMe } from "@/components/me";
import { api, ApiError, fmtTime, hoursSince, uuid } from "@/lib/client";
import { parseKod } from "@/lib/qr";
import type { SprzetView } from "@/lib/equipment";

type Lista = { lista: SprzetView[] };
type ActionRes = { pozycja: SprzetView | null; nieznany?: boolean; duplikat?: boolean; ostrzezenie?: string };

export default function Page() {
  return (
    <Suspense>
      <Skaner />
    </Suspense>
  );
}

/** Kod drzwi w zeskanowanym tekście: link /c?t=… albo sam token. */
function doorToken(text: string): string | null {
  try {
    const u = new URL(text);
    if (u.pathname === "/c" && u.searchParams.get("t")) return u.searchParams.get("t");
  } catch {}
  return /^[sk]\.\d+\./.test(text) ? text : null;
}

function Skaner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { me, reload } = useMe();
  const tryb = sp.get("tryb") === "drzwi" ? "drzwi" : "sprzet";

  const [lista, setLista] = useState<SprzetView[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<SprzetView | null>(null);
  const [uwagi, setUwagi] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [proponujCheckin, setProponujCheckin] = useState(false);
  const [poza, setPoza] = useState(false);
  const reqId = useRef<string>(uuid());

  const load = useCallback(async () => {
    const r = await api<Lista>("/api/sprzet");
    setLista(r.lista);
    return r.lista;
  }, []);

  useEffect(() => {
    load()
      .then((l) => {
        const k = parseKod(sp.get("kod"));
        if (k) {
          const found = l.find((s) => s.kod === k);
          if (found) setSel(found);
          else toast(`Nie ma sprzętu o kodzie ${k}.`, "bad");
        }
      })
      .catch((e) => toast((e as Error).message, "bad"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (s: SprzetView | null) => {
    setSel(s);
    setUwagi("");
    reqId.current = uuid();
  };

  const onScan = (text: string) => {
    const t = doorToken(text);
    if (t) {
      router.push(`/c?t=${encodeURIComponent(t)}`);
      return;
    }
    if (tryb === "drzwi") {
      toast("To nie jest kod drzwi studia.", "warn");
      return;
    }
    const k = parseKod(text);
    if (!k) {
      toast("Nie rozpoznano kodu sprzętu.", "warn");
      return;
    }
    const found = lista?.find((s) => s.kod === k);
    if (!found) {
      toast(`Nie ma sprzętu o kodzie ${k}.`, "bad");
      return;
    }
    select(found);
  };

  const act = async (akcja: "biore" | "oddaje" | "sprawdzam") => {
    if (!sel || busy) return;
    setBusy(akcja);
    try {
      const r = await api<ActionRes>("/api/akcja", { method: "POST", body: { kod: sel.kod, akcja, uwagi: uwagi.trim() || null, request_id: reqId.current, zrodlo: "skaner" } });
      const nazwa = r.pozycja?.nazwa ?? sel.nazwa;
      if (r.nieznany) toast("Tego kodu nie ma na liście. Administrator dostał informację.", "bad");
      else if (r.ostrzezenie) toast(r.ostrzezenie, "warn");
      else toast(akcja === "biore" ? `Wziąłeś: ${nazwa}` : akcja === "oddaje" ? `Oddane: ${nazwa}` : `Sprawdzone: ${nazwa}`);
      if (akcja === "biore" && !me?.wizyta) setProponujCheckin(true);
      // Najpierw odpowiedź serwera, potem odświeżenie listy i wyczyszczenie wyboru.
      await load();
      select(null);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się zapisać.", "bad");
    } finally {
      setBusy(null);
      reload();
    }
  };

  const shown = useMemo(() => {
    if (!lista) return [];
    const t = q.trim().toLowerCase();
    if (!t) return lista.filter((s) => !s.maQr);
    return lista.filter((s) => s.nazwa.toLowerCase().includes(t) || s.kategoria.toLowerCase().includes(t) || String(s.kod) === t);
  }, [lista, q]);

  const mojaPozycja = sel?.status === "wypozyczony" && sel.email === me?.email;

  return (
    <div className="flex flex-col">
      <ScreenHeader title={tryb === "drzwi" ? "Kod drzwi" : "Skaner"} />
      <div className={`flex flex-col gap-3.5 px-5 pt-2 ${sel ? "pb-80" : ""}`}>
        <QrScanner onScan={onScan} paused={!!sel || !!busy} hint={tryb === "drzwi" ? "Zeskanuj kod QR przy drzwiach studia" : undefined} label={tryb === "drzwi" ? "DRZWI" : "SKAN"} />

        {proponujCheckin && (
          <div className="flex items-center gap-3 rounded-[14px] border border-info/30 bg-card p-3">
            <span className="flex-1 text-sm">Jesteś w studiu? Zrób check-in, żeby było wiadomo, kto korzysta.</span>
            <Link href="/skaner?tryb=drzwi" onClick={() => setProponujCheckin(false)} className="flex h-11 items-center gap-1.5 rounded-xl border border-line-2 px-3 text-sm font-semibold">
              <IEnter size={16} /> Check-in
            </Link>
          </div>
        )}

        {tryb === "sprzet" && (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="szukaj" className="text-[13px] text-mute">
                …albo wybierz sprzęt bez QR
              </label>
              <div className="flex h-12 items-center gap-2.5 rounded-[14px] border border-line bg-card px-3.5">
                <ISearch size={18} className="text-mute" />
                <input
                  id="szukaj"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Szukaj, np. kabel, statyw, 12"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute/70"
                  autoComplete="off"
                />
              </div>
            </div>
            {!lista ? (
              <Skeleton rows={4} />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {shown.map((s) => (
                  <li key={s.kod}>
                    <button onClick={() => select(s)} className="flex min-h-12 w-full items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5 text-left">
                      <span className="w-8 font-mono text-xs font-semibold text-mute">{s.kod}</span>
                      <span className="flex-1 text-sm font-semibold">{s.nazwa}</span>
                      <span className={`text-xs ${s.status === "poza_szkola" ? "text-info" : s.status === "wypozyczony" ? "text-warn" : "text-ok"}`}>
                        {s.status === "poza_szkola" ? "Poza szkołą" : s.status === "wypozyczony" ? (s.email === me?.email ? "Ty" : shortName(s.ktoMa)) : "W studiu"}
                      </span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="py-4 text-center text-sm text-mute">Nic nie pasuje do „{q}”.</li>}
              </ul>
            )}
          </>
        )}
      </div>

      {sel && (
        <section
          aria-label="Wybrany sprzęt"
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md flex-col gap-3.5 rounded-t-[26px] border-t border-line bg-card px-5 pt-3 shadow-[0_-16px_40px_rgba(0,0,0,0.5)]"
          style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}
        >
          <span className="h-1 w-10 self-center rounded-full bg-line-2" />
          <div className="flex items-start gap-3">
            <span className="rounded-[10px] bg-chip px-2.5 py-2 font-mono text-[15px] font-semibold">{String(sel.kod).padStart(3, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold">{sel.nazwa}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
                <StatusPill status={sel.status} over24={hoursSince(sel.odKiedy) > 24} />
                {sel.status === "wypozyczony" && (
                  <span className="text-mute">
                    ma: {mojaPozycja ? "Ty" : sel.ktoMa}, od {fmtTime(sel.odKiedy)}
                  </span>
                )}
                {sel.status === "poza_szkola" && (
                  <span className="text-mute">
                    u: {sel.email === me?.email ? "Ty" : sel.ktoMa} · {pozaOpis(sel)}
                  </span>
                )}
              </div>
              {sel.rezerwacja && (
                <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${sel.rezerwacja.email === me?.email ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>
                  Zarezerwowane: {sel.rezerwacja.email === me?.email ? "Ty" : sel.rezerwacja.imie}, {fmtTime(sel.rezerwacja.od)}–{fmtTime(sel.rezerwacja.do)}
                </div>
              )}
            </div>
            <button onClick={() => select(null)} aria-label="Wyczyść wybór" className="flex h-11 w-11 items-center justify-center rounded-xl text-mute">
              <IX size={20} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="uwagi" className="text-[13px] text-mute">
              Uwagi (opcjonalnie)
            </label>
            <input
              id="uwagi"
              type="text"
              maxLength={500}
              value={uwagi}
              onChange={(e) => setUwagi(e.target.value)}
              placeholder="np. brak gąbki na mikrofonie"
              className="h-12 rounded-[14px] border border-line bg-bg px-3.5 text-[15px] outline-none placeholder:text-mute/70"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button onClick={() => act("biore")} busy={busy === "biore"} disabled={!!busy} className="h-14 rounded-2xl text-[17px] font-bold">
              Biorę
            </Button>
            <Button variant="ok" onClick={() => act("oddaje")} busy={busy === "oddaje"} disabled={!!busy} className="h-14 rounded-2xl text-[17px]">
              Oddaję
            </Button>
          </div>
          <div className="flex justify-between gap-2">
            <button onClick={() => act("sprawdzam")} disabled={!!busy} className="min-h-11 text-sm font-semibold text-mute underline-offset-4 hover:underline disabled:opacity-50">
              Sprawdzam — jest w studiu
            </button>
            <Link href={`/zajmij?kod=${sel.kod}`} className="flex min-h-11 items-center text-sm font-semibold text-rec-soft">
              Zajmij na później →
            </Link>
          </div>
          {me?.rola === "admin" && (
            <Button variant="ghost" onClick={() => setPoza(true)} disabled={!!busy} className="border-info/40 text-info">
              Poza szkołą (np. biorę do domu)…
            </Button>
          )}
        </section>
      )}
      {poza && sel && (
        <PozaSzkolaDialog
          kod={sel.kod}
          nazwa={sel.nazwa}
          meEmail={me?.email}
          onClose={() => setPoza(false)}
          onDone={async () => {
            await load();
            select(null);
          }}
        />
      )}
    </div>
  );
}

function shortName(n: string | null) {
  if (!n) return "";
  const [a, b] = n.split(" ");
  return b ? `${a} ${b[0]}.` : a;
}

