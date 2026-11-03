"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, useToast } from "./ui";
import { IX } from "./icons";

type Osoba = { email: string; imie: string; status: string };

/** Administrator oznacza sprzęt jako „poza szkołą” dla siebie albo innej osoby. */
export function PozaSzkolaDialog({ kod, nazwa, meEmail, onClose, onDone }: { kod: number; nazwa: string; meEmail?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [osoby, setOsoby] = useState<Osoba[]>([]);
  const [email, setEmail] = useState(meEmail ?? "");
  const [miejsce, setMiejsce] = useState("w domu");
  const [zwrot, setZwrot] = useState("");
  const [uwagi, setUwagi] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ uzytkownicy: Osoba[] }>("/api/admin/uzytkownicy").then((r) => setOsoby(r.uzytkownicy.filter((u) => u.status === "aktywny")));
    // Domyślnie: ja.
    if (!meEmail) api<{ email: string }>("/api/me").then((m) => setEmail((e) => e || m.email)).catch(() => {});
  }, [meEmail]);

  const zapisz = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/sprzet/${kod}/poza-szkola`, { method: "POST", body: { email, miejsce, planowanyZwrot: zwrot || null, uwagi: uwagi || null } });
      toast(`${nazwa}: poza szkołą.`);
      onDone();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Nie udało się.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Poza szkołą"
        onClick={(e) => e.stopPropagation()}
        onSubmit={zapisz}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-[26px] border border-line bg-card p-5 sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Poza szkołą</h2>
            <p className="text-sm text-mute">{nazwa}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="flex h-11 w-11 items-center justify-center rounded-xl text-mute">
            <IX />
          </button>
        </div>
        <label className="flex flex-col gap-1 text-xs text-mute">
          U kogo
          <select required value={email} onChange={(e) => setEmail(e.target.value)} className="inp">
            {osoby.map((o) => (
              <option key={o.email} value={o.email}>
                {o.imie}
                {o.email === meEmail ? " (ja)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          Gdzie
          <input required value={miejsce} onChange={(e) => setMiejsce(e.target.value)} maxLength={100} list="miejsca" className="inp" />
          <datalist id="miejsca">
            <option value="w domu" />
            <option value="na nagraniu" />
            <option value="w serwisie" />
            <option value="wypożyczony na wydarzenie" />
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          Planowany zwrot (opcjonalnie)
          <input type="date" value={zwrot} min={today} onChange={(e) => setZwrot(e.target.value)} className="inp" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          Uwagi (opcjonalnie)
          <input value={uwagi} onChange={(e) => setUwagi(e.target.value)} maxLength={300} className="inp" />
        </label>
        <p className="text-xs text-mute">Sprzęt będzie wszędzie widoczny jako nieobecny w szkole. Nie dostaje przypomnień i nie liczy się jako brak w inwentaryzacji. Powrót: zwykłe „Oddaję”.</p>
        <Button type="submit" variant="rec" busy={busy} className="h-12 rounded-2xl">
          Zapisz
        </Button>
      </form>
    </div>
  );
}
