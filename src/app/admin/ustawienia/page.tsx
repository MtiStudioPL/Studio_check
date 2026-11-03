"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Skeleton, useToast } from "@/components/ui";
import { QrImage } from "@/components/qr-image";
import { api, ApiError } from "@/lib/client";

type S = { cisza: { od: string; do: string }; inwentaryzacjaTylkoAdmin: boolean; checkinWCiszy: "odrzucaj" | "pozwalaj"; administratorzy: string[]; powiadomienia: string[] };

export default function UstawieniaPage() {
  const toast = useToast();
  const [s, setS] = useState<S | null>(null);
  const [kod, setKod] = useState<{ wersja: number; link: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<S>("/api/admin/ustawienia").then(setS).catch((e) => toast((e as Error).message, "bad"));
    api<{ wersja: number; link: string }>("/api/admin/kod-drzwi").then(setKod).catch(() => {});
  }, [toast]);

  const zapisz = async () => {
    if (!s) return;
    setBusy("zapisz");
    try {
      setS(await api<S>("/api/admin/ustawienia", { method: "PATCH", body: { cisza: s.cisza, inwentaryzacjaTylkoAdmin: s.inwentaryzacjaTylkoAdmin, checkinWCiszy: s.checkinWCiszy } }));
      toast("Zapisano ustawienia.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  const rotuj = async () => {
    if (!confirm("Unieważnić obecny kod drzwi? Stara naklejka przestanie działać od razu — trzeba wydrukować nową.")) return;
    setBusy("rotuj");
    try {
      setKod(await api<{ wersja: number; link: string }>("/api/admin/kod-drzwi/rotuj", { method: "POST" }));
      toast("Nowy kod drzwi gotowy do druku.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Nie udało się.", "bad");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="wide text-3xl font-extrabold">Ustawienia</h1>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="label">Kod drzwi studia</h2>
        {!kod ? (
          <Skeleton rows={1} />
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-black">
              <QrImage text={kod.link} size={180} label="Kod QR drzwi studia" />
              <span className="text-sm font-bold">Studio wideo · check-in</span>
              <span className="font-mono text-[10px] text-black/60">wersja {kod.wersja}</span>
            </div>
            <div className="flex min-w-60 flex-1 flex-col gap-3 text-sm">
              <p className="text-mute">Wydrukuj i powieś przy wejściu. Link nic nie zapisuje sam z siebie — check-in wymaga zalogowania i potwierdzenia.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.print()}>Drukuj</Button>
                <Button variant="danger" busy={busy === "rotuj"} onClick={rotuj}>
                  Unieważnij i wygeneruj nowy
                </Button>
                <Link href="/kiosk" className="flex min-h-11 items-center rounded-xl border border-line-2 px-4 font-semibold">
                  Tryb kiosku (kod co 30 s)
                </Link>
              </div>
            </div>
          </div>
        )}
      </Card>

      {!s ? (
        <Skeleton rows={3} />
      ) : (
        <Card className="no-print flex flex-col gap-5 p-5">
          <h2 className="label">Zasady</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-mute">
              Cisza od
              <input type="time" value={s.cisza.od} onChange={(e) => setS({ ...s, cisza: { ...s.cisza, od: e.target.value } })} className="inp" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-mute">
              do
              <input type="time" value={s.cisza.do} onChange={(e) => setS({ ...s, cisza: { ...s.cisza, do: e.target.value } })} className="inp" />
            </label>
            <p className="pb-3 text-xs text-mute">W ciszy nie wychodzą przypomnienia, a o jej początku otwarte wizyty zamykają się automatycznie.</p>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={s.inwentaryzacjaTylkoAdmin} onChange={(e) => setS({ ...s, inwentaryzacjaTylkoAdmin: e.target.checked })} className="h-5 w-5 accent-[#FF5533]" />
            Start inwentaryzacji i maile o brakach tylko dla administratora
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1">Check-in w godzinach ciszy</legend>
            <label className="flex items-center gap-3">
              <input type="radio" name="cisza" checked={s.checkinWCiszy === "odrzucaj"} onChange={() => setS({ ...s, checkinWCiszy: "odrzucaj" })} className="h-5 w-5 accent-[#FF5533]" /> Odrzucaj
            </label>
            <label className="flex items-center gap-3">
              <input type="radio" name="cisza" checked={s.checkinWCiszy === "pozwalaj"} onChange={() => setS({ ...s, checkinWCiszy: "pozwalaj" })} className="h-5 w-5 accent-[#FF5533]" /> Pozwalaj i wysyłaj mail do administratora
            </label>
          </fieldset>
          <div className="text-sm text-mute">
            <p>Administratorzy awaryjni (ADMIN_EMAILS): {s.administratorzy.join(", ") || "—"}</p>
            <p>Maile administracyjne trafiają do: {s.powiadomienia.join(", ") || "—"}</p>
            <p className="mt-1 text-xs">Te dwie listy zmienia się w zmiennych środowiska na Vercelu; rolę Studio.Admin nadaje się w Entra.</p>
          </div>
          <div>
            <Button variant="rec" onClick={zapisz} busy={busy === "zapisz"}>
              Zapisz
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
