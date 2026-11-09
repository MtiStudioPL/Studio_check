"use client";

import Link from "next/link";
import { useActionState } from "react";
import { poprosOKodAction, zalogujKodemAction, type LoginState } from "../actions";

const input = "h-14 w-full rounded-2xl border border-line-2 bg-card px-4 text-lg outline-none focus:border-rec";
const primary = "flex h-16 items-center justify-center rounded-2xl bg-rec text-lg font-extrabold text-bg active:scale-[0.99] disabled:opacity-60";

type Tryb = "login" | "rejestracja";

/** Wspólny mechanizm kodu z maila; ekran logowania i ekran rejestracji to osobne strony z osobnymi formularzami. */
function CodeForm({ tryb, next, domena }: { tryb: Tryb; next: string; domena: string }) {
  const [s1, poproś, czeka1] = useActionState<LoginState, FormData>(poprosOKodAction, { krok: "email" });
  const [s2, zaloguj, czeka2] = useActionState<LoginState, FormData>(zalogujKodemAction, { krok: "kod" });
  // Błąd z kroku 2 może cofnąć do e-maila (np. „masz już konto”) — pokazujemy wtedy ten stan.
  const wroc = s2.krok === "email" && s2.blad;
  const kod = s1.krok === "kod" && !wroc;
  const email = s1.email ?? "";
  const rej = tryb === "rejestracja";
  const blad = wroc ? s2.blad : s1.blad;

  if (!kod) {
    return (
      <form action={poproś} className="flex flex-col gap-3">
        <input type="hidden" name="tryb" value={tryb} />
        {rej && (
          <input name="imie" type="text" autoComplete="name" required minLength={3} maxLength={80} placeholder="Imię i nazwisko" className={input} />
        )}
        <input name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={s1.email} placeholder={`imie.nazwisko@${domena}`} className={input} />
        <button disabled={czeka1} className={primary}>
          {czeka1 ? "Wysyłam…" : "Wyślij kod na e-mail"}
        </button>
        {blad && <p role="alert" className="text-center text-sm text-rec">{blad}</p>}
        <p className="text-center text-xs text-mute">Tylko adresy @{domena}. Kod przyjdzie na Twoją szkolną skrzynkę.</p>
        <p className="text-center text-sm text-mute">
          {rej ? "Masz już konto? " : "Nie masz konta? "}
          <Link href={rej ? "/login" : "/rejestracja"} className="font-semibold text-ink underline underline-offset-2">
            {rej ? "Zaloguj się" : "Zarejestruj się"}
          </Link>
        </p>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={zaloguj} className="flex flex-col gap-3">
        <input type="hidden" name="tryb" value={tryb} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <p className="text-sm text-mute">
          Wysłaliśmy 6-cyfrowy kod na <b>{email}</b>. Sprawdź też folder ze spamem.
        </p>
        <input name="kod" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus placeholder="000000" className={`${input} text-center font-mono tracking-[0.4em]`} />
        <button disabled={czeka2} className={primary}>
          {czeka2 ? "Sprawdzam…" : rej ? "Załóż konto" : "Zaloguj"}
        </button>
        {s2.blad && <p role="alert" className="text-center text-sm text-rec">{s2.blad}</p>}
      </form>
      <form action={poproś} className="flex justify-center">
        <input type="hidden" name="tryb" value={tryb} />
        <input type="hidden" name="email" value={email} />
        {rej && <input type="hidden" name="imie" value={s1.imie ?? ""} />}
        <button disabled={czeka1} className="text-xs text-mute underline underline-offset-2">
          {czeka1 ? "Wysyłam…" : "Wyślij nowy kod"}
        </button>
      </form>
    </div>
  );
}

export function LoginForm({ next, domena }: { next: string; domena: string }) {
  return <CodeForm tryb="login" next={next} domena={domena} />;
}

export function RegisterForm({ domena }: { domena: string }) {
  return <CodeForm tryb="rejestracja" next="/" domena={domena} />;
}
