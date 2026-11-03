import Link from "next/link";

export const metadata = { title: "Brak dostępu · Studio wideo" };

const TEKSTY: Record<string, { t: string; d: string }> = {
  domena: { t: "Ta aplikacja przyjmuje tylko konta szkolne mti.edu.pl", d: "Zaloguj się kontem szkolnym Microsoft. Konta prywatne i konta innych organizacji są odrzucane." },
  blokada: { t: "Konto jest zablokowane", d: "Skontaktuj się z opiekunem studia, żeby je odblokować." },
};

export default async function OdmowaPage({ searchParams }: { searchParams: Promise<{ powod?: string; error?: string }> }) {
  const sp = await searchParams;
  const k = sp.powod && TEKSTY[sp.powod] ? sp.powod : sp.error === "AccessDenied" ? "domena" : null;
  const tx = k ? TEKSTY[k] : { t: "Nie udało się zalogować", d: "Spróbuj ponownie. Jeśli problem wraca, napisz do opiekuna studia." };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <span className="label">Studio wideo</span>
      <h1 className="wide text-3xl font-extrabold leading-tight">{tx.t}</h1>
      <p className="text-mute">{tx.d}</p>
      <Link href="/login" className="flex h-14 items-center justify-center rounded-2xl border border-line-2 font-semibold">
        Wróć do logowania
      </Link>
    </main>
  );
}
