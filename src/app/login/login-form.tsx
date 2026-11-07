"use client";

import { useActionState } from "react";
import { poprosOKodAction, zalogujKodemAction, type LoginState } from "../actions";

const input = "h-14 w-full rounded-2xl border border-line-2 bg-card px-4 text-lg outline-none focus:border-rec";
const primary = "flex h-16 items-center justify-center rounded-2xl bg-rec text-lg font-extrabold text-bg active:scale-[0.99] disabled:opacity-60";

export function LoginForm({ next, domena }: { next: string; domena: string }) {
  const [s1, poproś, czeka1] = useActionState<LoginState, FormData>(poprosOKodAction, { krok: "email" });
  const [s2, zaloguj, czeka2] = useActionState<LoginState, FormData>(zalogujKodemAction, { krok: "kod" });
  const kod = s1.krok === "kod";
  const email = s1.email ?? "";

  if (!kod) {
    return (
      <form action={poproś} className="flex flex-col gap-3">
        <input name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={s1.email} placeholder={`imie.nazwisko@${domena}`} className={input} />
        <input name="imie" type="text" autoComplete="name" maxLength={80} placeholder="Imię i nazwisko (przy pierwszym logowaniu)" className={input} />
        <button disabled={czeka1} className={primary}>
          {czeka1 ? "Wysyłam…" : "Wyślij kod na e-mail"}
        </button>
        {s1.blad && <p role="alert" className="text-center text-sm text-rec">{s1.blad}</p>}
        <p className="text-center text-xs text-mute">Tylko adresy @{domena}. Kod przyjdzie na Twoją szkolną skrzynkę.</p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={zaloguj} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <p className="text-sm text-mute">
          Wysłaliśmy 6-cyfrowy kod na <b>{email}</b>. Sprawdź też folder ze spamem.
        </p>
        <input name="kod" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus placeholder="000000" className={`${input} text-center font-mono tracking-[0.4em]`} />
        <button disabled={czeka2} className={primary}>
          {czeka2 ? "Sprawdzam…" : "Zaloguj"}
        </button>
        {s2.blad && <p role="alert" className="text-center text-sm text-rec">{s2.blad}</p>}
      </form>
      <form action={poproś} className="flex justify-center">
        <input type="hidden" name="email" value={email} />
        <button disabled={czeka1} className="text-xs text-mute underline underline-offset-2">
          {czeka1 ? "Wysyłam…" : "Wyślij nowy kod"}
        </button>
      </form>
    </div>
  );
}
