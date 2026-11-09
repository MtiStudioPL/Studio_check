"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/components/me";
import { api, fmtClock, fmtDayLong, fmtHours, fmtTime, hoursSince, initials } from "@/lib/client";
import { Card, KodChip, Skeleton, pozaOpis } from "@/components/ui";
import { IBox, ICalendar, IClipboard, IEnter, IExit, IPeople, IScan, IShield } from "@/components/icons";
import { logoutAction } from "../actions";
import { AnimatedNumber } from "@/components/animated-number";
import type { SprzetView } from "@/lib/equipment";

type Lista = { lista: SprzetView[]; liczniki: { wszystkie: number; sprawdzone: number; poza: number; ponad24: number; pozaSzkola: number } };

export default function StartPage() {
  const { me } = useMe();
  const [data, setData] = useState<Lista | null>(null);
  const [wStudiu, setWStudiu] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    api<Lista>("/api/sprzet?filtr=wypozyczone").then(setData).catch(() => {});
    api<{ osoby: unknown[] }>("/api/obecnosc/teraz").then((r) => setWStudiu(r.osoby.length)).catch(() => {});
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mine = data && me ? data.lista.filter((s) => s.email === me.email) : [];
  const firstName = me?.imie.split(" ")[0] ?? "";

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between px-5 pb-1 pt-4">
        <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
          <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
          STUDIO WIDEO
        </div>
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            aria-label={`Konto: ${me?.imie ?? ""}`}
            aria-expanded={menu}
            className="h-11 w-11 rounded-full border border-line bg-card text-[13px] font-semibold"
          >
            {me ? initials(me.imie) : ""}
          </button>
          {menu && (
            <div className="menu-in absolute right-0 top-12 z-40 w-60 origin-top-right rounded-2xl border border-line bg-card p-2 shadow-2xl">
              <p className="px-3 py-2 text-xs text-mute">{me?.email}</p>
              {me?.rola === "admin" && (
                <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-chip">
                  <IShield size={18} /> Panel administratora
                </Link>
              )}
              <Link href="/prywatnosc" className="flex min-h-11 items-center rounded-xl px-3 text-sm hover:bg-chip">
                Twoje dane w aplikacji
              </Link>
              <form action={logoutAction}>
                <button className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-bad hover:bg-chip">Wyloguj</button>
              </form>
            </div>
          )}
        </div>
      </header>

      <section className="px-5 pt-2">
        <h1 className="wide text-[32px] font-extrabold leading-[1.05] tracking-tight">Cześć{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1.5 text-sm text-mute first-letter:uppercase">{fmtDayLong()}</p>
      </section>

      <div className="stagger flex flex-col gap-3 px-5 pt-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {me?.wizyta ? (
          <Card className="flex items-center gap-3 py-3 pl-4 pr-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ok shadow-[0_0_0_5px_rgba(61,220,151,0.16)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">W studiu od {fmtTime(me.wizyta.wejscie)}</div>
              <div className="mt-0.5 font-mono text-[13px] text-mute">{fmtClock(Date.now() - new Date(me.wizyta.wejscie).getTime())}</div>
            </div>
            <Link href="/wyjscie" className="press flex h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
              <IExit size={18} /> Wychodzę
            </Link>
          </Card>
        ) : me ? (
          <Card className="flex items-center gap-3 py-3 pl-4 pr-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-line-2" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">Nie jesteś w studiu</div>
              <div className="mt-0.5 text-[13px] text-mute">Zeskanuj kod przy drzwiach</div>
            </div>
            <Link href="/skaner?tryb=drzwi" className="press flex h-11 items-center gap-2 rounded-xl border border-line-2 px-4 text-sm font-semibold">
              <IEnter size={18} /> Wchodzę
            </Link>
          </Card>
        ) : (
          <Skeleton rows={1} />
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Card className="px-4 py-3.5">
            <div className="font-mono text-[34px] font-semibold leading-none">{data ? <AnimatedNumber value={data.liczniki.poza} /> : "–"}</div>
            <div className="mt-2 text-[13px] text-mute">szt. poza studiem{data?.liczniki.pozaSzkola ? ` · ${data.liczniki.pozaSzkola} poza szkołą` : ""}</div>
          </Card>
          <Card className="px-4 py-3.5">
            <div className={`font-mono text-[34px] font-semibold leading-none ${data?.liczniki.ponad24 ? "text-bad" : ""}`}>{data ? <AnimatedNumber value={data.liczniki.ponad24} /> : "–"}</div>
            <div className="mt-2 text-[13px] text-mute">ponad 24 h u kogoś</div>
          </Card>
        </div>

        <Link href="/skaner" className="press flex h-[92px] items-center gap-4 rounded-[22px] bg-rec px-5 text-bg">
          <IScan size={36} />
          <span className="flex flex-col gap-0.5">
            <span className="wide text-[21px] font-extrabold">Skanuj sprzęt</span>
            <span className="text-[13px] font-medium">Biorę · Oddaję · sprzęt bez QR z listy</span>
          </span>
        </Link>

        <Link href="/zajmij" className="press flex h-14 items-center justify-center gap-2 rounded-[18px] border border-line-2 bg-card text-[15px] font-bold">
          <ICalendar size={20} className="text-rec" /> Zajmij sprzęt na później
        </Link>

        <div className="grid grid-cols-3 gap-2.5 lg:col-span-2">
          <Shortcut href="/wypozyczone" label="Wypożyczone" sub={data ? `${data.liczniki.poza} szt.` : "…"} icon={<IBox className="text-warn" />} />
          <Shortcut href="/inwentaryzacja" label="Inwentaryzacja" sub={data ? `${data.liczniki.sprawdzone} / ${data.liczniki.wszystkie}` : "…"} icon={<IClipboard className="text-ok" />} />
          <Shortcut href="/obecnosc" label="Obecność" sub={wStudiu == null ? "…" : osoby(wStudiu)} icon={<IPeople className="text-info" />} />
        </div>

        <section className="stagger mt-1 flex flex-col gap-2 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-2.5 lg:[&>:first-child]:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Masz u siebie</h2>
            <span className="font-mono text-xs text-mute">{mine.length} szt.</span>
          </div>
          {!data ? (
            <Skeleton rows={2} />
          ) : mine.length === 0 ? (
            <p className="text-sm text-mute lg:col-span-2">Nic nie jest zapisane na Ciebie.</p>
          ) : (
            mine.map((s) => (
              <div key={s.kod} className="flex items-center gap-3 rounded-[14px] border border-line bg-card py-2 pl-3 pr-2">
                <KodChip kod={s.kod} tone={s.status === "poza_szkola" ? "info" : hoursSince(s.odKiedy) > 24 ? "bad" : "warn"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.nazwa}</div>
                  <div className="mt-0.5 text-xs text-mute">
                    {s.status === "poza_szkola" ? <span className="text-info">poza szkołą · {pozaOpis(s)}</span> : <>od {fmtTime(s.odKiedy)} · {fmtHours(s.odKiedy)}</>}
                  </div>
                </div>
                <Link href={`/skaner?kod=${s.kod}`} className="press flex h-11 items-center rounded-xl bg-ok-bg px-3.5 text-sm font-semibold text-ok">
                  Oddaj
                </Link>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function osoby(n: number) {
  if (n === 1) return "1 osoba";
  const d = n % 10, dd = n % 100;
  return `${n} ${d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "osoby" : "osób"}`;
}

function Shortcut({ href, label, sub, icon }: { href: string; label: string; sub: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="press flex min-h-24 flex-col gap-2.5 rounded-[18px] border border-line bg-card px-3 py-3.5">
      {icon}
      <span className="text-[13px] font-semibold">{label}</span>
      <span className="font-mono text-xs text-mute">{sub}</span>
    </Link>
  );
}
