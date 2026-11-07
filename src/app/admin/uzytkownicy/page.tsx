"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Skeleton, cx, useToast } from "@/components/ui";
import { api, ApiError, fmtDateTime } from "@/lib/client";

type U = {
  oid: string; email: string; imie: string; rola: "admin" | "uzytkownik"; status: "aktywny" | "oczekuje" | "zablokowany"; powod: string | null;
  dodanyRecznie: boolean; adminZKonfiguracji: boolean; dodal: string | null; zaakceptowal: string | null; pierwsze: string; ostatnie: string | null;
};

export default function UzytkownicyPage() {
  const toast = useToast();
  const [lista, setLista] = useState<U[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [nowa, setNowa] = useState({ email: "", imie: "", rola: "uzytkownik" as "uzytkownik" | "admin" });

  const load = useCallback(() => api<{ uzytkownicy: U[] }>("/api/admin/uzytkownicy").then((r) => setLista(r.uzytkownicy)), []);
  useEffect(() => {
    load().catch((e) => toast((e as Error).message, "bad"));
  }, [load, toast]);

  const run = async (u: U, payload: Record<string, unknown>, ok: string, method = "PATCH") => {
    setBusy(u.oid);
    try {
      await api(`/api/admin/uzytkownicy/${encodeURIComponent(u.oid)}`, { method, body: method === "DELETE" ? undefined : payload });
      toast(ok);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const dodaj = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("nowa");
    try {
      await api("/api/admin/uzytkownicy", { method: "POST", body: nowa });
      toast(`Dodano: ${nowa.imie}${nowa.rola === "admin" ? " (administrator)" : ""}. Może się logować od razu.`);
      setNowa({ email: "", imie: "", rola: "uzytkownik" });
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Nie udało się dodać.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const oczekujacy = (lista ?? []).filter((u) => u.status === "oczekuje");
  const reszta = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista ?? []).filter((u) => u.status !== "oczekuje" && (!t || u.email.includes(t) || u.imie.toLowerCase().includes(t)));
  }, [lista, q]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="wide text-3xl font-extrabold">Użytkownicy</h1>
        <p className="mt-1 text-sm text-mute">Każda nowa osoba po pierwszym logowaniu czeka tu na akceptację — bez niej nie widzi żadnych danych.</p>
      </div>

      <section>
        <h2 className="label mb-2">Czekają na akceptację ({oczekujacy.length})</h2>
        {!lista ? (
          <Skeleton rows={2} />
        ) : oczekujacy.length === 0 ? (
          <Empty>Nikt nie czeka.</Empty>
        ) : (
          <Card className="divide-y divide-line border-warn/30">
            {oczekujacy.map((u) => (
              <div key={u.oid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <div className="text-sm font-semibold">{u.imie}</div>
                  <div className="text-xs text-mute">
                    {u.email} · pierwsze logowanie {fmtDateTime(u.pierwsze)}
                  </div>
                </div>
                <Button variant="ok" className="min-h-10 px-4 text-sm" busy={busy === u.oid} onClick={() => run(u, { akcja: "akceptuj" }, `Zaakceptowano: ${u.imie}. Dostanie maila.`)}>
                  Akceptuj
                </Button>
                <Button
                  variant="danger"
                  className="min-h-10 px-4 text-sm"
                  disabled={busy === u.oid}
                  onClick={() => {
                    const powod = prompt(`Odrzucić ${u.imie}? Powód (opcjonalnie):`, "spoza ekipy studia");
                    if (powod !== null) run(u, { akcja: "odrzuc", ...(powod ? { powod } : {}) }, "Odrzucono.");
                  }}
                >
                  Odrzuć
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <Card className="p-4">
        <h2 className="label mb-3">Dodaj osobę</h2>
        <form onSubmit={dodaj} className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
          <label className="flex flex-col gap-1 text-xs text-mute">
            E-mail szkolny
            <input required type="email" value={nowa.email} onChange={(e) => setNowa({ ...nowa, email: e.target.value })} placeholder="imie.nazwisko@mti.edu.pl" className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Imię i nazwisko
            <input required value={nowa.imie} onChange={(e) => setNowa({ ...nowa, imie: e.target.value })} maxLength={120} className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-mute">
            Rola
            <select value={nowa.rola} onChange={(e) => setNowa({ ...nowa, rola: e.target.value as "uzytkownik" | "admin" })} className="inp">
              <option value="uzytkownik">Ekipa studia</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <Button type="submit" variant="rec" busy={busy === "nowa"} className="self-end">
            Dodaj
          </Button>
        </form>
        <p className="mt-2 text-xs text-mute">Dodana osoba jest zaakceptowana z góry — przy pierwszym logowaniu nie czeka.</p>
      </Card>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="label">Wszyscy ({reszta.length})</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj" className="inp max-w-xs" aria-label="Szukaj osoby" />
        </div>
        {!lista ? (
          <Skeleton rows={6} />
        ) : (
          <Card className="divide-y divide-line">
            {reszta.map((u) => (
              <div key={u.oid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {u.imie}
                    {u.rola === "admin" && <span className="rounded-full bg-rec/15 px-2 py-0.5 text-[11px] text-rec-soft">administrator</span>}
                    {u.status === "zablokowany" && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] text-bad">zablokowany</span>}
                    {u.dodanyRecznie && <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] text-mute">jeszcze się nie logował</span>}
                  </div>
                  <div className="text-xs text-mute">
                    {u.email}
                    {u.ostatnie ? ` · ostatnio ${fmtDateTime(u.ostatnie)}` : ""}
                    {u.status === "zablokowany" && u.powod ? ` · ${u.powod}` : ""}
                  </div>
                </div>
                {u.status !== "zablokowany" &&
                  (u.rola === "admin" ? (
                    <Button
                      className="min-h-10 px-3 text-sm"
                      disabled={busy === u.oid || u.adminZKonfiguracji}
                      onClick={() => confirm(`Odebrać ${u.imie} rolę administratora?`) && run(u, { akcja: "rola", rola: "uzytkownik" }, "Odebrano rolę administratora.")}
                    >
                      {u.adminZKonfiguracji ? "Admin z konfiguracji" : "Odbierz admina"}
                    </Button>
                  ) : (
                    <Button
                      className="min-h-10 px-3 text-sm"
                      disabled={busy === u.oid}
                      onClick={() => confirm(`Nadać ${u.imie} rolę administratora? Będzie widzieć panel, historię i obecności.`) && run(u, { akcja: "rola", rola: "admin" }, `${u.imie} jest administratorem.`)}
                    >
                      Nadaj admina
                    </Button>
                  ))}
                {u.dodanyRecznie ? (
                  <Button variant="danger" className="min-h-10 px-3 text-sm" disabled={busy === u.oid} onClick={() => confirm(`Usunąć ${u.imie} z listy?`) && run(u, {}, "Usunięto.", "DELETE")}>
                    Usuń
                  </Button>
                ) : (
                  <Button
                    variant={u.status === "zablokowany" ? "soft-ok" : "danger"}
                    className={cx("min-h-10 px-3 text-sm")}
                    disabled={busy === u.oid}
                    onClick={() => {
                      if (u.status === "zablokowany") return run(u, { akcja: "odblokuj" }, "Odblokowano.");
                      const powod = prompt(`Zablokować ${u.imie}? Powód:`, "");
                      if (powod !== null) run(u, { akcja: "zablokuj", ...(powod ? { powod } : {}) }, "Zablokowano.");
                    }}
                  >
                    {u.status === "zablokowany" ? "Odblokuj" : "Zablokuj"}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
        <p className="text-xs text-mute">„Admin z konfiguracji” to osoby z listy ADMIN_EMAILS — tę listę zmienia się w zmiennych środowiska na Vercelu, nie w panelu.</p>
      </section>
    </div>
  );
}
