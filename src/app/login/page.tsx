import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata = { title: "Logowanie · Studio wideo" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; wylogowano?: string }> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const session = await auth().catch(() => null);
  if (session?.user?.oid) redirect(next);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-10">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="wide text-[40px] font-extrabold leading-[1.02] tracking-tight">
            Sprzęt i obecność
            <br />w studiu.
          </h1>
          <p className="mt-4 text-[15px] text-mute">Biorę, oddaję, inwentaryzacja i check-in — z telefonu, po zalogowaniu kodem wysłanym na szkolny adres e-mail. Pierwszy raz tutaj? Najpierw załóż konto.</p>
        </div>

        {sp.wylogowano && <p className="rounded-2xl border border-line bg-card p-4 text-sm text-mute">Wylogowano.</p>}

        <LoginForm next={next} domena={config.domain} />
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
