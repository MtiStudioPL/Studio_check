import Link from "next/link";

export const metadata = { title: "Twoje dane · Studio wideo" };

// Treść do potwierdzenia z inspektorem ochrony danych szkoły (cel, zakres, okres przechowywania).
export default function PrywatnoscPage() {
  const miesiace = Number(process.env.ATTENDANCE_RETENTION_MONTHS ?? 12);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-6 py-10 text-[15px] leading-relaxed">
      <Link href="/" className="text-sm text-mute underline underline-offset-4">
        ← Wróć
      </Link>
      <h1 className="wide text-3xl font-extrabold">Twoje dane w aplikacji</h1>
      <p>Aplikacja studia wideo służy do bezpieczeństwa studia i sprzętu szkoły. Zapisuje:</p>
      <ul className="list-disc space-y-2 pl-5 text-mute">
        <li>Twoje imię, nazwisko i szkolny adres e-mail (podane przy rejestracji),</li>
        <li>kto, kiedy i jaki sprzęt wziął, oddał lub sprawdził, z ewentualnymi uwagami,</li>
        <li>godziny wejścia do studia i wyjścia (check-in / check-out),</li>
        <li>logowania i działania administracyjne (dziennik bezpieczeństwa; adres IP tylko jako nieodwracalny skrót).</li>
      </ul>
      <p>
        Godziny obecności są przechowywane przez {miesiace} miesięcy, potem anonimizowane. Historię sprzętu widzi administrator studia; listę osób, które są
        teraz w studiu, widzą wszyscy zalogowani.
      </p>
      <h2 className="text-lg font-bold">Ciasteczka</h2>
      <p className="text-mute">
        Aplikacja używa jednego ciasteczka sesji (HttpOnly, Secure, SameSite), które utrzymuje Twoje zalogowanie przez maksymalnie 12 godzin i jest niezbędne do działania.
        Nie ma ciasteczek reklamowych, analitycznych ani śledzących. W przeglądarce zapisujemy jeszcze tylko informację, że zamknąłeś komunikat o ciasteczkach, oraz
        pamięć podręczną plików aplikacji, żeby szybciej się ładowała.
      </p>
      <h2 className="text-lg font-bold">Bezpieczeństwo logowania</h2>
      <p className="text-mute">
        Logujesz się jednorazowym kodem wysłanym na szkolny adres e-mail. Kody są ważne 10 minut, przechowywane tylko jako skrót i blokowane po kilku błędnych próbach.
        Formularze chronią limity prób i weryfikacja przed automatami (boty).
      </p>
      <p className="text-mute">Aplikacja nie czyta Twojej poczty ani plików. Pytania o dane kieruj do inspektora ochrony danych szkoły.</p>
    </main>
  );
}
