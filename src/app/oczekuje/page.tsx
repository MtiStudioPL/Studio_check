import Link from "next/link";

export const metadata = { title: "Czeka na akceptację · Studio wideo" };

/** Pierwsze logowanie: konto istnieje, ale administrator jeszcze go nie zaakceptował. Sesja nie powstaje. */
export default function OczekujePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-warn shadow-[0_0_0_4px_rgba(255,181,71,0.18)]" />
        STUDIO WIDEO
      </div>
      <h1 className="wide text-3xl font-extrabold leading-tight">Konto czeka na akceptację</h1>
      <p className="text-mute">
        Z aplikacji korzysta tylko ekipa studia. Administrator dostał powiadomienie o Twoim logowaniu. Gdy zaakceptuje konto, dostaniesz maila — wtedy zaloguj się
        ponownie.
      </p>
      <Link href="/login" className="flex h-14 items-center justify-center rounded-2xl border border-line-2 font-semibold">
        Zaloguj ponownie
      </Link>
    </main>
  );
}
