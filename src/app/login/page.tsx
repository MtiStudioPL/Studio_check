import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loginAction } from "../actions";

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
          <p className="mt-4 text-[15px] text-mute">Biorę, oddaję, inwentaryzacja i check-in — z telefonu, po zalogowaniu szkolnym kontem.</p>
        </div>

        {sp.wylogowano && <p className="rounded-2xl border border-line bg-card p-4 text-sm text-mute">Wylogowano.</p>}

        <form action={loginAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next} />
          <button className="flex h-16 items-center justify-center gap-3 rounded-2xl bg-rec text-lg font-extrabold text-bg active:scale-[0.99]">
            <svg width="22" height="22" viewBox="0 0 23 23" aria-hidden>
              <path fill="#0E1013" d="M1 1h10v10H1zM12 1h10v10H12zM1 12h10v10H1zM12 12h10v10H12z" />
            </svg>
            Zaloguj kontem szkolnym
          </button>
          <p className="text-center text-xs text-mute">Tylko konta @mti.edu.pl. Logowanie odbywa się na stronie Microsoft.</p>
        </form>
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
