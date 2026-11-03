"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, KodChip, Skeleton, cx, useToast } from "@/components/ui";
import { IAlert, ICheck } from "@/components/icons";
import { api, ApiError, dayKey, fmtDateTime, fmtDayHeader, fmtTime } from "@/lib/client";

type Stan = "wolny" | "zajety" | "oczekuje" | "poza_szkola" | "wypozyczony";
type Dost = { kod: number; nazwa: string; stan: Stan; opis: string | null };
type Rez = { id: number; imie: string; email: string; od: string; do: string; cel: string | null; status: string; powod: string | null; decyzjaPrzez: string | null; utworzono: string; pozycje: { kod: number; nazwa: string }[] };
type Data = { oczekujace: (Rez & { dostepnosc: Dost[] })[]; nadchodzace: Rez[]; ostatnie: Rez[] };

const STAN: Record<Stan, { label: string; cls: string; tone: "ok" | "bad" | "warn" | "info" }> = {
  wolny: { label: "Dostępny", cls: "bg-ok-bg text-ok", tone: "ok" },
  zajety: { label: "Zajęty", cls: "bg-bad-bg text-bad", tone: "bad" },
  oczekuje: { label: "Inne wnioski", cls: "bg-warn-bg text-warn", tone: "warn" },
  poza_szkola: { label: "Poza szkołą", cls: "bg-info-bg text-info", tone: "info" },
  wypozyczony: { label: "Teraz u kogoś", cls: "bg-warn-bg text-warn", tone: "warn" },
};
const STATUS: Record<string, string> = { zatwierdzona: "text-ok", odrzucona: "text-bad", anulowana: "text-mute", wygasla: "text-mute" };

const okres = (r: { od: string; do: string }) => `${fmtDateTime(r.od)} – ${dayKey(r.od) === dayKey(r.do) ? fmtTime(r.do) : fmtDateTime(r.do)}`;

export default function RezerwacjePage() {
  const toast = useToast();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Data>("/api/admin/rezerwacje").then(setD).catch((e) => toast((e as Error).message, "bad")), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const decyzja = async (r: Rez, dec: "zatwierdz" | "odrzuc") => {
    let powod: string | null = null;
    if (dec === "odrzuc") {
      const p = prompt(`Odrzucić rezerwację ${r.imie}? Powód (osoba go zobaczy):`, "");
      if (p === null) return;
      powod = p || null;
    }
    setBusy(`${r.id}${dec}`);
    try {
      await api(`/api/admin/rezerwacje/${r.id}`, { method: "POST", body: { decyzja: dec, powod } });
      toast(dec === "zatwierdz" ? `Zatwierdzono — ${r.imie} dostanie maila.` : "Odrzucono.");
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
      load();
    } finally {
      setBusy(null);
    }
  };

  const anuluj = async (r: Rez) => {
    if (!confirm(`Anulować zatwierdzoną rezerwację ${r.imie}?`)) return;
    try {
      await api(`/api/rezerwacje/${r.id}/anuluj`, { method: "POST" });
      toast("Anulowano.");
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    }
  };

  // nadchodzące pogrupowane po dniach
  const dni: { day: string; rows: Rez[] }[] = [];
  for (const r of d?.nadchodzace ?? []) {
    const k = dayKey(r.od);
    if (dni.at(-1)?.day !== k) dni.push({ day: k, rows: [] });
    dni.at(-1)!.rows.push(r);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="wide text-3xl font-extrabold">Rezerwacje</h1>
        <p className="mt-1 text-sm text-mute">Wnioski „Zajmij” z dostępnością każdej pozycji w wybranych godzinach. Zatwierdzenie nakładających się rezerwacji blokuje baza.</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="label">Do decyzji ({d?.oczekujace.length ?? "…"})</h2>
        {!d ? (
          <Skeleton rows={3} />
        ) : d.oczekujace.length === 0 ? (
          <Empty>Brak wniosków.</Empty>
        ) : (
          d.oczekujace.map((r) => {
            const zajete = r.dostepnosc.filter((x) => x.stan === "zajety");
            const uwaga = r.dostepnosc.filter((x) => x.stan !== "wolny" && x.stan !== "zajety");
            return (
              <Card key={r.id} className={cx("flex flex-col gap-3 p-4", zajete.length ? "border-bad/40" : uwaga.length ? "border-warn/30" : "border-ok/30")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold">{okres(r)}</div>
                    <div className="text-sm text-mute">
                      {r.imie} · {r.email} · wysłano {fmtDateTime(r.utworzono)}
                    </div>
                    {r.cel && <div className="mt-1 text-sm">„{r.cel}”</div>}
                  </div>
                  <span className={cx("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", zajete.length ? "bg-bad-bg text-bad" : uwaga.length ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok")}>
                    {zajete.length ? <IAlert size={14} /> : <ICheck size={14} />}
                    {zajete.length ? "Konflikt" : uwaga.length ? "Sprawdź" : "Wszystko dostępne"}
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
                  {r.dostepnosc.map((x) => (
                    <li key={x.kod} className="flex items-center gap-3 px-3 py-2">
                      <KodChip kod={x.kod} tone={STAN[x.stan].tone} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.nazwa}</span>
                        {x.opis && <span className="block truncate text-xs text-mute">{x.opis}</span>}
                      </span>
                      <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STAN[x.stan].cls)}>{STAN[x.stan].label}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ok" busy={busy === `${r.id}zatwierdz`} disabled={!!busy || zajete.length > 0} onClick={() => decyzja(r, "zatwierdz")}>
                    Zatwierdź
                  </Button>
                  <Button variant="danger" busy={busy === `${r.id}odrzuc`} disabled={!!busy} onClick={() => decyzja(r, "odrzuc")}>
                    Odmów
                  </Button>
                  {zajete.length > 0 && <span className="self-center text-xs text-bad">Najpierw anuluj kolidującą rezerwację albo odmów.</span>}
                </div>
              </Card>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Zatwierdzone — nadchodzące</h2>
        {!d ? (
          <Skeleton rows={2} />
        ) : dni.length === 0 ? (
          <Empty>Brak nadchodzących rezerwacji.</Empty>
        ) : (
          dni.map((g) => (
            <div key={g.day}>
              <h3 className="mb-2 text-sm font-semibold first-letter:uppercase">{fmtDayHeader(g.rows[0].od)}</h3>
              <Card className="divide-y divide-line">
                {g.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-28 font-mono text-xs text-mute">
                      {fmtTime(r.od)}–{dayKey(r.od) === dayKey(r.do) ? fmtTime(r.do) : fmtDateTime(r.do)}
                    </span>
                    <span className="w-36 font-semibold">{r.imie}</span>
                    <span className="min-w-0 flex-1 text-mute">{r.pozycje.map((p) => p.nazwa).join(", ")}</span>
                    <Button className="min-h-9 px-3 text-xs" onClick={() => anuluj(r)}>
                      Anuluj
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Ostatnio rozpatrzone</h2>
        {d && d.ostatnie.length > 0 ? (
          <Card className="divide-y divide-line">
            {d.ostatnie.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-40 font-mono text-xs text-mute">{okres(r)}</span>
                <span className="w-36 font-semibold">{r.imie}</span>
                <span className="min-w-0 flex-1 truncate text-mute">{r.pozycje.map((p) => p.nazwa).join(", ")}</span>
                <span className={cx("text-xs font-semibold", STATUS[r.status])}>
                  {r.status}
                  {r.powod ? ` · ${r.powod}` : ""}
                </span>
              </div>
            ))}
          </Card>
        ) : (
          <Empty>Brak.</Empty>
        )}
      </section>
    </div>
  );
}
