import "server-only";
import { escapeHtml as e, htmlTable } from "./html";
import { fmtDateTime, fmtTime, hoursSince } from "./time";
import { config } from "./config";

/**
 * Wszystkie treści maili w jednym miejscu.
 * UWAGA przed przełączeniem: teksty raportu 15:30 (przepływ 2), przypomnień 6 h / 19:00 (przepływ 3)
 * i „Przypomnij osobie” (przepływ C) trzeba porównać z oryginałami z Power Automate i podmienić tutaj 1:1.
 */
type Item = { kod: number | null; nazwa: string; ktoMa?: string | null; email?: string | null; odKiedy?: Date | null };

const wrap = (body: string) =>
  `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111">${body}<p style="color:#666;font-size:12px">Studio wideo · <a href="${e(config.appUrl)}">${e(config.appUrl)}</a></p></div>`;

const sprzetTable = (items: Item[]) =>
  htmlTable(
    ["Kod", "Nazwa", "Od kiedy", "Godzin"],
    items.map((i) => [i.kod ?? "", i.nazwa, fmtDateTime(i.odKiedy), Math.floor(hoursSince(i.odKiedy))]),
  );

// --- maile administracyjne z akcji (przepływ 1 / A) ---
export function mailPrzejecie(p: { kod: number; nazwa: string; poprzedni: string; poprzedniEmail: string | null; nowy: string; nowyEmail: string; od: Date | null; uwagi: string | null }) {
  return {
    subject: `Studio: ${p.nazwa} (${p.kod}) przejęty bez zwrotu`,
    html: wrap(
      `<p><b>${e(p.nowy)}</b> (${e(p.nowyEmail)}) wziął sprzęt, który według systemu był u <b>${e(p.poprzedni)}</b> (${e(p.poprzedniEmail ?? "")}) od ${e(fmtDateTime(p.od))}.</p>` +
        htmlTable(["Kod", "Nazwa", "Uwagi"], [[p.kod, p.nazwa, p.uwagi ?? ""]]),
    ),
  };
}

export function mailOddanieCudzego(p: { kod: number; nazwa: string; wlasciciel: string; wlascicielEmail: string | null; oddajacy: string; oddajacyEmail: string; od: Date | null; uwagi: string | null }) {
  return {
    subject: `Studio: ${p.nazwa} (${p.kod}) oddany przez inną osobę`,
    html: wrap(
      `<p><b>${e(p.oddajacy)}</b> (${e(p.oddajacyEmail)}) oddał sprzęt zapisany na <b>${e(p.wlasciciel)}</b> (${e(p.wlascicielEmail ?? "")}, od ${e(fmtDateTime(p.od))}).</p>` +
        htmlTable(["Kod", "Nazwa", "Uwagi"], [[p.kod, p.nazwa, p.uwagi ?? ""]]),
    ),
  };
}

export function mailSprawdzamWypozyczony(p: { kod: number; nazwa: string; ktoMa: string | null; email: string | null; od: Date | null; sprawdzil: string; uwagi: string | null }) {
  return {
    subject: `Studio: ${p.nazwa} (${p.kod}) jest w studiu, choć figuruje jako wypożyczony`,
    html: wrap(
      `<p><b>${e(p.sprawdzil)}</b> potwierdził obecność sprzętu w studiu. W systemie jest wypożyczony przez ${e(p.ktoMa ?? "")} (${e(p.email ?? "")}) od ${e(fmtDateTime(p.od))}. Status nie został zmieniony.</p>` +
        htmlTable(["Kod", "Nazwa", "Uwagi"], [[p.kod, p.nazwa, p.uwagi ?? ""]]),
    ),
  };
}

export function mailNieznanyKod(p: { kod: number; akcja: string; kto: string; email: string; uwagi: string | null }) {
  return {
    subject: `Studio: nieznany kod ${p.kod}`,
    html: wrap(
      `<p>${e(p.kto)} (${e(p.email)}) wybrał akcję „${e(p.akcja)}” dla kodu, którego nie ma na liście sprzętu.</p>` +
        htmlTable(["Kod", "Akcja", "Uwagi"], [[p.kod, p.akcja, p.uwagi ?? ""]]),
    ),
  };
}

// --- przypomnienia (przepływ 3) ---
export function mailPrzypomnienie6h(name: string, items: Item[]) {
  return {
    subject: "Studio: przypomnienie o oddaniu sprzętu",
    html: wrap(`<p>Cześć ${e(name)},</p><p>masz wypożyczony sprzęt ze studia. Oddaj go, gdy skończysz pracę.</p>${sprzetTable(items)}`),
  };
}

export function mailPrzypomnienie19(name: string, items: Item[]) {
  return {
    subject: "Studio: sprzęt nadal nie został oddany",
    html: wrap(`<p>Cześć ${e(name)},</p><p>sprzęt poniżej wciąż jest zapisany na Ciebie. Oddaj go jak najszybciej albo napisz do opiekuna studia.</p>${sprzetTable(items)}`),
  };
}

// --- logowanie kodem z maila ---
export function mailKodLogowania(kod: string, ttlMin: number) {
  return {
    subject: `Studio wideo: kod logowania ${kod}`,
    html: wrap(
      `<p>Twój kod logowania do aplikacji Studio wideo:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${e(kod)}</p>` +
        `<p>Kod jest ważny ${ttlMin} minut i działa tylko raz. Jeśli to nie Ty próbujesz się zalogować, zignoruj tę wiadomość.</p>`,
    ),
  };
}

// --- na żądanie (przepływ C, 5, B) ---
export function mailPrzypomnijOsobie(name: string, items: Item[], ktoProsi: string) {
  return {
    subject: "Studio: prośba o oddanie sprzętu",
    html: wrap(`<p>Cześć ${e(name)},</p><p>${e(ktoProsi)} prosi o oddanie sprzętu ze studia:</p>${sprzetTable(items)}`),
  };
}

export function mailBrakiOsoba(name: string, items: Item[]) {
  return {
    subject: "Studio: inwentaryzacja — sprzęt na Ciebie",
    html: wrap(`<p>Cześć ${e(name)},</p><p>trwa inwentaryzacja studia. Ten sprzęt jest zapisany na Ciebie:</p>${sprzetTable(items)}<p>Oddaj go albo daj znać, gdzie jest.</p>`),
  };
}

export function mailBrakiAdmin(wypozyczone: Item[], zaginione: { kod: number; nazwa: string; ostatni: string }[], poza: (Item & { miejsce?: string | null; planowanyZwrot?: string | null })[] = []) {
  return {
    subject: `Studio: inwentaryzacja — ${wypozyczone.length + zaginione.length} braków`,
    html: wrap(
      `<h3>Wypożyczone (${wypozyczone.length})</h3>` +
        htmlTable(["Kod", "Nazwa", "Kto ma", "Od kiedy"], wypozyczone.map((i) => [i.kod ?? "", i.nazwa, i.ktoMa ?? "", fmtDateTime(i.odKiedy)])) +
        `<h3>Brak w studiu, bez wypożyczenia (${zaginione.length})</h3>` +
        htmlTable(["Kod", "Nazwa", "Ostatni wpis w Historii"], zaginione.map((z) => [z.kod, z.nazwa, z.ostatni])) +
        (poza.length
          ? `<h3>Poza szkołą — wiadomo, gdzie jest (${poza.length})</h3>` +
            htmlTable(["Kod", "Nazwa", "U kogo", "Gdzie", "Zwrot do"], poza.map((i) => [i.kod ?? "", i.nazwa, i.ktoMa ?? "", i.miejsce ?? "", i.planowanyZwrot ?? ""]))
          : ""),
    ),
  };
}

// --- raport 15:30 (przepływ 2 + nowe sekcje) ---
export function mailRaport(p: {
  wypozyczone: Item[];
  poza?: (Item & { miejsce?: string | null; planowanyZwrot?: string | null })[];
  rezerwacje?: { imie: string; od: Date; do: Date; sprzet: string }[];
  oczekujace?: number;
  dzis: { imie: string; wejscie: Date; wyjscie: Date | null }[];
  auto: { imie: string; wejscie: Date; wyjscie: Date | null }[];
  dataStr: string;
}) {
  const wyp = p.wypozyczone.length
    ? htmlTable(
        ["Kod", "Nazwa", "Kto ma", "E-mail", "Od kiedy", "Godzin"],
        p.wypozyczone.map((i) => [i.kod ?? "", i.nazwa, i.ktoMa ?? "", i.email ?? "", fmtDateTime(i.odKiedy), Math.floor(hoursSince(i.odKiedy))]),
      )
    : "<p>Cały sprzęt jest w studiu.</p>";
  const dzis = p.dzis.length
    ? htmlTable(["Osoba", "Wejście", "Wyjście"], p.dzis.map((v) => [v.imie, fmtTime(v.wejscie), v.wyjscie ? fmtTime(v.wyjscie) : "w studiu"]))
    : "<p>Nikt nie zrobił dziś check-inu.</p>";
  const auto = p.auto.length
    ? `<h3>Wizyty zamknięte automatycznie wczoraj (${p.auto.length})</h3>` +
      htmlTable(["Osoba", "Wejście", "Zamknięta"], p.auto.map((v) => [v.imie, fmtDateTime(v.wejscie), fmtDateTime(v.wyjscie)]))
    : "";
  return {
    subject: `Studio: raport ${p.dataStr} — ${p.wypozyczone.length} szt. poza studiem`,
    html: wrap(
      `<h3>Sprzęt poza studiem (${p.wypozyczone.length})</h3>${wyp}` +
        (p.poza?.length
          ? `<h3>Poza szkołą (${p.poza.length})</h3>` +
            htmlTable(["Kod", "Nazwa", "U kogo", "Gdzie", "Zwrot do"], p.poza.map((i) => [i.kod ?? "", i.nazwa, i.ktoMa ?? "", i.miejsce ?? "", i.planowanyZwrot ?? ""]))
          : "") +
        (p.rezerwacje?.length
          ? `<h3>Rezerwacje na dziś i jutro (${p.rezerwacje.length})</h3>` +
            htmlTable(["Kto", "Od", "Do", "Sprzęt"], p.rezerwacje.map((r) => [r.imie, fmtDateTime(r.od), fmtDateTime(r.do), r.sprzet]))
          : "") +
        (p.oczekujace ? `<p><b>Rezerwacje czekające na decyzję: ${p.oczekujace}</b> — <a href="${e(config.appUrl)}/admin/rezerwacje">otwórz panel</a></p>` : "") +
        `<h3>Dziś w studiu</h3>${dzis}${auto}`,
    ),
  };
}

// --- nowe ---
export function mailAutoCheckout(name: string, wejscie: Date) {
  return {
    subject: "Studio: Twoja wizyta została zamknięta automatycznie",
    html: wrap(`<p>Cześć ${e(name)},</p><p>nie zrobiłeś check-outu po wejściu o ${e(fmtTime(wejscie))}. O 21:00 system zamknął wizytę automatycznie. Następnym razem kliknij „Wychodzę” przed wyjściem.</p>`),
  };
}

export function mailBlokada(p: { email: string; imie: string; powod: string }) {
  return {
    subject: `Studio: konto ${p.email} zablokowane automatycznie`,
    html: wrap(`<p>Konto <b>${e(p.imie)}</b> (${e(p.email)}) zostało zablokowane: ${e(p.powod)}.</p><p>Odblokujesz je w panelu: Użytkownicy.</p>`),
  };
}

export function mailCheckinWCiszy(p: { imie: string; email: string; kiedy: Date }) {
  return {
    subject: `Studio: check-in w godzinach ciszy (${p.imie})`,
    html: wrap(`<p>${e(p.imie)} (${e(p.email)}) zrobił check-in o ${e(fmtDateTime(p.kiedy))}.</p>`),
  };
}

export function mailNowaOsoba(p: { imie: string; email: string }) {
  return {
    subject: `Studio: ${p.imie} czeka na akceptację`,
    html: wrap(`<p><b>${e(p.imie)}</b> (${e(p.email)}) zalogował się po raz pierwszy i czeka na dostęp do aplikacji studia.</p><p><a href="${e(config.appUrl)}/admin/uzytkownicy">Zaakceptuj albo odrzuć w panelu</a></p>`),
  };
}

export function mailDostepPrzyznany(imie: string) {
  return {
    subject: "Studio: masz dostęp do aplikacji",
    html: wrap(`<p>Cześć ${e(imie)},</p><p>administrator zaakceptował Twoje konto. Możesz już korzystać z aplikacji studia.</p><p><a href="${e(config.appUrl)}">Otwórz aplikację</a></p>`),
  };
}

// --- rezerwacje („Zajmij”) ---
const STAN: Record<string, string> = { wolny: "wolny", zajety: "ZAJĘTY", oczekuje: "inne wnioski", poza_szkola: "poza szkołą", wypozyczony: "teraz wypożyczony" };
const okres = (od: Date | string, doo: Date | string) => `${fmtDateTime(od)} – ${fmtDateTime(doo)}`;

export function mailRezerwacjaNowa(p: { id: number; imie: string; email: string; od: Date; do: Date; cel: string | null; pozycje: { kod: number; nazwa: string; stan: string; opis: string | null }[] }) {
  const problem = p.pozycje.some((x) => x.stan !== "wolny");
  return {
    subject: `Studio: ${p.imie} chce zająć sprzęt ${fmtDateTime(p.od)}${problem ? " — sprawdź dostępność" : ""}`,
    html: wrap(
      `<p><b>${e(p.imie)}</b> (${e(p.email)}) prosi o rezerwację: <b>${e(okres(p.od, p.do))}</b>.</p>` +
        (p.cel ? `<p>Cel: ${e(p.cel)}</p>` : "") +
        htmlTable(["Kod", "Sprzęt", "Dostępność", "Szczegóły"], p.pozycje.map((x) => [x.kod, x.nazwa, STAN[x.stan] ?? x.stan, x.opis ?? ""])) +
        `<p><a href="${e(config.appUrl)}/admin/rezerwacje">Zatwierdź albo odmów w panelu</a></p>`,
    ),
  };
}

export function mailRezerwacjaDecyzja(r: { imie: string; od: string; do: string; status: string; powod: string | null; pozycje: { kod: number; nazwa: string }[] }) {
  const tytul = r.status === "zatwierdzona" ? "rezerwacja zatwierdzona" : r.status === "odrzucona" ? "rezerwacja odrzucona" : "rezerwacja wygasła";
  const tresc =
    r.status === "zatwierdzona"
      ? "administrator zatwierdził Twoją rezerwację. Odbierając sprzęt, zeskanuj go jak zwykle (Biorę)."
      : r.status === "odrzucona"
        ? "administrator nie zatwierdził Twojej rezerwacji."
        : "nikt nie rozpatrzył Twojego wniosku przed jego początkiem, więc wygasł.";
  return {
    subject: `Studio: ${tytul} (${fmtDateTime(r.od)})`,
    html: wrap(
      `<p>Cześć ${e(r.imie.split(" ")[0])},</p><p>${e(tresc)}</p><p><b>${e(okres(r.od, r.do))}</b></p>` +
        (r.powod ? `<p>Uwagi administratora: ${e(r.powod)}</p>` : "") +
        htmlTable(["Kod", "Sprzęt"], r.pozycje.map((x) => [x.kod, x.nazwa])),
    ),
  };
}

export function mailRezerwacjaAnulowana(r: { imie: string; email: string; od: string; do: string; pozycje: { kod: number; nazwa: string }[] }) {
  return {
    subject: `Studio: ${r.imie} anulował rezerwację (${fmtDateTime(r.od)})`,
    html: wrap(`<p>${e(r.imie)} (${e(r.email)}) anulował zatwierdzoną rezerwację <b>${e(okres(r.od, r.do))}</b>.</p>` + htmlTable(["Kod", "Sprzęt"], r.pozycje.map((x) => [x.kod, x.nazwa]))),
  };
}
