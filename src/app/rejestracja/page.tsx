import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { RegisterForm } from "../login/login-form";

export const metadata = { title: "Rejestracja · Studio wideo" };

/** Osobny ekran zakładania konta. Konto czeka potem na akceptację administratora. */
export default async function RejestracjaPage() {
  const session = await auth().catch(() => null);
  if (session?.user?.oid) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-10">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="wide text-[40px] font-extrabold leading-[1.02] tracking-tight">Załóż konto.</h1>
          <p className="mt-4 text-[15px] text-mute">
            Podaj imię, nazwisko i szkolny adres e-mail, potwierdź go kodem. Z aplikacji korzysta tylko ekipa studia, więc administrator musi jeszcze zaakceptować konto —
            dostaniesz o tym maila.
          </p>
        </div>

        <RegisterForm domena={config.domain} />
      </div>

      <p className="text-xs leading-relaxed text-mute">
        Aplikacja zapisuje, kto i kiedy bierze lub oddaje sprzęt oraz godziny wejścia i wyjścia ze studia — w celu bezpieczeństwa studia i sprzętu.{" "}
        <Link href="/prywatnosc" className="underline underline-offset-2">
          Szczegóły
        </Link>
      </p>
    </main>
  );
}
