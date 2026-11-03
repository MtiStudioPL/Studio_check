import Link from "next/link";

export const metadata = { title: "Demo · Studio wideo" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-10">
      <div className="flex items-center gap-2.5 font-mono text-xs tracking-[0.14em] text-mute">
        <span className="h-2.5 w-2.5 rounded-full bg-rec shadow-[0_0_0_4px_rgba(255,85,51,0.18)]" />
        STUDIO WIDEO · DEMO
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="wide text-[40px] font-extrabold leading-[1.02] tracking-tight">
            Sprzęt i obecność
            <br />w studiu.
          </h1>
          <p className="mt-4 text-[15px] text-mute">
            To wersja demonstracyjna: bez logowania Microsoft i bez prawdziwej bazy. Dane są przykładowe i zapisują się tylko w tej przeglądarce.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/" className="flex h-16 items-center justify-center rounded-2xl bg-rec text-lg font-extrabold text-bg active:scale-[0.99]">
            Wejdź do aplikacji
          </Link>
          <Link href="/admin" className="flex h-14 items-center justify-center rounded-2xl border border-line-2 text-base font-bold">
            Panel administratora
          </Link>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-mute">
        Przycisk „DEMO” u góry ekranu pozwala przełączyć rolę, zasymulować skan kodu przy drzwiach i zresetować dane.
      </p>
    </main>
  );
}
