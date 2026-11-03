/**
 * Testy na prawdziwym PostgreSQL. Uruchamiane, gdy jest TEST_DATABASE_URL (konto studio_app, po migracji):
 *   TEST_DATABASE_URL=postgres://studio_app:haslo@localhost/studio npm test
 * Czyszczenie tabel robi konto właściciela z TEST_DATABASE_URL_ADMIN.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_URL_ADMIN;
const run = url && adminUrl ? describe : describe.skip;

run("integracja z bazą", () => {
  let owner: ReturnType<typeof postgres>;
  let E: typeof import("@/lib/equipment");
  let A: typeof import("@/lib/attendance");
  let C: typeof import("@/lib/cron");
  let D: typeof import("@/db");
  let tok: typeof import("@/lib/doorToken");
  let R: typeof import("@/lib/reservations");
  let U: typeof import("@/lib/users");

  const jan = { oid: "11111111-1111-1111-1111-111111111111", email: "jan.k@mti.edu.pl", name: "Jan Kowalski", admin: false };
  const ola = { oid: "22222222-2222-2222-2222-222222222222", email: "ola.n@mti.edu.pl", name: "Ola Nowak", admin: false };
  const rid = () => crypto.randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    owner = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    D = await import("@/db");
    E = await import("@/lib/equipment");
    A = await import("@/lib/attendance");
    C = await import("@/lib/cron");
    tok = await import("@/lib/doorToken");
    R = await import("@/lib/reservations");
    U = await import("@/lib/users");
  });

  beforeEach(async () => {
    await owner`truncate sprzet, historia, uzytkownicy, obecnosci, audyt, mail_outbox, rezerwacje, rezerwacje_sprzet restart identity cascade`;
    await owner`delete from ustawienia where klucz in ('raport_ostatni','retencja_ostatnia')`;
    await owner`update ustawienia set wartosc = '"odrzucaj"' where klucz = 'checkin_w_ciszy'`;
    await owner`insert into sprzet (kod, nazwa, kategoria, ma_qr) values (7, 'Mikrofon krawatowy #2', 'Audio', true), (12, 'Kamera A', 'Wideo', true), (112, 'Kabel XLR 5 m', 'Kable', false)`;
    for (const u of [jan, ola]) await owner`insert into uzytkownicy (oid, email, imie, zaakceptowany) values (${u.oid}, ${u.email}, ${u.name}, true)`;
  });

  const mails = () => owner<{ do: string; rodzaj: string; temat: string; tresc_html: string }[]>`select "do", rodzaj, temat, tresc_html from mail_outbox order by id`;
  const hist = () => owner<{ akcja: string; nazwa: string; kod: number; email: string }[]>`select akcja, nazwa, kod, email from historia order by id`;

  it("Biorę → Oddaję: stan, historia, brak maili", async () => {
    const r = await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    expect(r.pozycja).toMatchObject({ status: "wypozyczony", email: jan.email, jest: false });
    const r2 = await E.performAction(jan, { kod: 7, akcja: "oddaje", requestId: rid(), uwagi: "ok" });
    expect(r2.pozycja).toMatchObject({ status: "w_studiu", email: null, ktoMa: null, jest: true });
    expect((await hist()).map((h) => h.akcja)).toEqual(["Biorę", "Oddaję"]);
    expect(await mails()).toHaveLength(0);
  });

  it("przejęcie bez zwrotu i oddanie cudzego → maile do administratora", async () => {
    await E.performAction(jan, { kod: 12, akcja: "biore", requestId: rid() });
    const r = await E.performAction(ola, { kod: 12, akcja: "biore", requestId: rid() });
    expect(r.ostrzezenie).toContain("Jan Kowalski");
    expect(r.pozycja?.email).toBe(ola.email);
    await E.performAction(jan, { kod: 12, akcja: "oddaje", requestId: rid() });
    expect((await mails()).map((m) => m.rodzaj)).toEqual(["przejecie", "oddanie_cudzego"]);
    expect((await mails())[0].do).toBe("admin@mti.edu.pl");
  });

  it("Sprawdzam na wypożyczonym: status bez zmian, mail informacyjny", async () => {
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    const r = await E.performAction(ola, { kod: 7, akcja: "sprawdzam", requestId: rid() });
    expect(r.pozycja).toMatchObject({ status: "wypozyczony", jest: true, email: jan.email });
    expect((await mails()).map((m) => m.rodzaj)).toEqual(["sprawdzam_wypozyczony"]);
  });

  it("nieznany kod: wpis „(nieznany kod)” i mail, sprzęt bez zmian", async () => {
    const r = await E.performAction(jan, { kod: 999, akcja: "biore", requestId: rid() });
    expect(r.nieznany).toBe(true);
    expect((await hist())[0]).toMatchObject({ nazwa: "(nieznany kod)", kod: 999 });
    expect((await mails())[0].rodzaj).toBe("nieznany_kod");
  });

  it("podwójne kliknięcie (ten sam request_id) daje jeden wpis", async () => {
    const id = rid();
    const [a, b] = await Promise.all([
      E.performAction(jan, { kod: 7, akcja: "biore", requestId: id }),
      E.performAction(jan, { kod: 7, akcja: "biore", requestId: id }),
    ]);
    expect([a.duplikat, b.duplikat].filter(Boolean)).toHaveLength(1);
    expect(await hist()).toHaveLength(1);
  });

  it("dwie osoby jednocześnie biorą ten sam kod: stan spójny, oba wpisy w historii", async () => {
    await Promise.all([E.performAction(jan, { kod: 12, akcja: "biore", requestId: rid() }), E.performAction(ola, { kod: 12, akcja: "biore", requestId: rid() })]);
    const h = await hist();
    expect(h).toHaveLength(2);
    const [s] = await owner<{ email: string }[]>`select email from sprzet where kod = 12`;
    expect(s.email).toBe(h[1].email); // stan = ostatni wpis
    expect((await mails()).map((m) => m.rodzaj)).toEqual(["przejecie"]);
  });

  it("uwagi z HTML są escapowane w mailu", async () => {
    await E.performAction(jan, { kod: 12, akcja: "biore", requestId: rid() });
    await E.performAction(ola, { kod: 12, akcja: "biore", requestId: rid(), uwagi: "<script>alert(1)</script>" });
    const m = (await mails())[0];
    expect(m.tresc_html).not.toContain("<script>");
    expect(m.tresc_html).toContain("&lt;script&gt;");
  });

  it("inwentaryzacja: start jednym zapytaniem i maile o brakach", async () => {
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    expect(await E.startInventory(jan)).toEqual({ zmienione: 2 }); // 7 ma już jest=false
    await E.setJest(jan, 12, true);
    const r = await E.sendShortageReminders(jan);
    expect(r).toEqual({ braki: 2, osoby: 1 });
    expect((await mails()).map((m) => [m.rodzaj, m.do])).toEqual([
      ["braki_osoba", jan.email],
      ["braki_admin", "admin@mti.edu.pl"],
    ]);
  });

  it("check-in: zły token, poprawny, podwójny; check-out ze sprzętem", async () => {
    await expect(A.checkIn(jan, "s.1.zly", null)).rejects.toMatchObject({ code: "zly_kod_drzwi" });
    const good = tok.makeStaticToken(process.env.DOOR_SECRET!, 1);
    const day = new Date();
    const quiet = (await import("@/lib/time")).inQuiet(day);
    if (quiet) {
      await expect(A.checkIn(jan, good, null)).rejects.toMatchObject({ code: "cisza" });
      await owner`update ustawienia set wartosc = '"pozwalaj"' where klucz = 'checkin_w_ciszy'`;
    }
    const a = await A.checkIn(jan, good, null);
    expect(a.juz).toBe(false);
    const b = await A.checkIn(jan, good, null);
    expect(b.juz).toBe(true);
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    const c1 = await A.checkOut(jan, false);
    expect(c1.wymagaPotwierdzenia).toBe(true);
    const c2 = await A.checkOut(jan, true);
    expect(c2.wizyta.wyjscie).not.toBeNull();
    expect(c2.wizyta.sprzetPrzyWyjsciu).toEqual([7]);
    await expect(A.checkOut(jan, true)).rejects.toMatchObject({ code: "brak_wizyty" });
  });

  it("baza pilnuje jednej otwartej wizyty na osobę", async () => {
    await owner`insert into obecnosci (user_oid, email, imie, zrodlo_wejscia) values (${jan.oid}, ${jan.email}, 'Jan', 'naklejka')`;
    await expect(owner`insert into obecnosci (user_oid, email, imie, zrodlo_wejscia) values (${jan.oid}, ${jan.email}, 'Jan', 'naklejka')`).rejects.toThrow();
  });

  it("cron: przypomnienie 6 h raz, 19:00 raz, auto check-out o 21:00, raport 15:30 raz", async () => {
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    await owner`update sprzet set od_kiedy = '2026-10-30T07:00:00Z' where kod = 7`; // 8:00 Warszawa
    await owner`insert into obecnosci (user_oid, email, imie, wejscie, zrodlo_wejscia) values (${ola.oid}, ${ola.email}, 'Ola Nowak', '2026-10-30T16:00:00Z', 'naklejka')`;

    const t = (iso: string) => C.tick(new Date(iso));
    await t("2026-10-30T13:15:00Z"); // 14:15 — 6 h minęło
    await t("2026-10-30T13:30:00Z"); // ponowny tick — nic nowego
    await t("2026-10-30T14:30:00Z"); // 15:30 piątek — raport
    await t("2026-10-30T14:45:00Z"); // raport już był
    await t("2026-10-30T18:00:00Z"); // 19:00 — wieczorne
    await t("2026-10-30T18:15:00Z"); // już było dziś
    await t("2026-10-30T20:00:00Z"); // 21:00 — auto check-out
    await t("2026-10-30T20:15:00Z");
    const r = (await mails()).map((m) => m.rodzaj);
    expect(r).toEqual(["przyp_6h", "raport", "przyp_19", "auto_checkout"]);
    const [v] = await owner<{ zrodlo_wyjscia: string }[]>`select zrodlo_wyjscia from obecnosci`;
    expect(v.zrodlo_wyjscia).toBe("auto");
  });

  it("cron: przypomnienie 6 h wypadające w ciszy idzie po 7:00", async () => {
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    await owner`update sprzet set od_kiedy = '2026-10-30T18:00:00Z' where kod = 7`; // 19:00 → 6 h = 1:00
    await C.tick(new Date("2026-10-31T00:15:00Z")); // 1:15 — cisza
    expect(await mails()).toHaveLength(0);
    await C.tick(new Date("2026-10-31T06:00:00Z")); // 7:00
    expect((await mails()).map((m) => m.rodzaj)).toEqual(["przyp_6h"]);
  });

  it("konto aplikacji nie może zmieniać ani usuwać historii", async () => {
    await E.performAction(jan, { kod: 7, akcja: "biore", requestId: rid() });
    const app = postgres(url!, { max: 1 });
    await expect(app`update historia set akcja = 'x'`).rejects.toThrow(/permission/);
    await expect(app`delete from audyt`).rejects.toThrow(/permission/);
    await app.end();
  });

  it("D jest używane", () => expect(D.db).toBeTruthy());

  // ---------- akceptacja osób ----------
  it("nowa osoba czeka na akceptację i administrator dostaje mail", async () => {
    const u = await U.upsertOnLogin("44444444-4444-4444-4444-444444444444", "nowy@mti.edu.pl", "Nowy Uczeń", false);
    expect(u.zaakceptowany).toBe(false);
    expect((await mails()).map((m) => [m.rodzaj, m.do])).toEqual([["nowa_osoba", "admin@mti.edu.pl"]]);
    const again = await U.upsertOnLogin("44444444-4444-4444-4444-444444444444", "nowy@mti.edu.pl", "Nowy Uczeń", false);
    expect(again.zaakceptowany).toBe(false);
    expect(await mails()).toHaveLength(1); // drugi raz bez maila
  });

  it("osoba dodana przez administratora przejmuje oid przy pierwszym logowaniu i zachowuje rolę", async () => {
    await owner`insert into uzytkownicy (oid, email, imie, rola, zaakceptowany, dodal) values ('dodany:kasia@mti.edu.pl', 'kasia@mti.edu.pl', 'Kasia', 'admin', true, 'jan.k@mti.edu.pl')`;
    const u = await U.upsertOnLogin("55555555-5555-5555-5555-555555555555", "kasia@mti.edu.pl", "Kasia Wiśniewska", false);
    expect(u).toMatchObject({ oid: "55555555-5555-5555-5555-555555555555", rola: "admin", zaakceptowany: true, imie: "Kasia Wiśniewska" });
    expect(await mails()).toHaveLength(0);
  });

  it("administrator z konfiguracji jest od razu aktywny", async () => {
    const u = await U.upsertOnLogin("66666666-6666-6666-6666-666666666666", "szef@mti.edu.pl", "Szef", true);
    expect(u).toMatchObject({ rola: "admin", zaakceptowany: true });
  });

  // ---------- poza szkołą ----------
  const admin = { ...jan, admin: true };
  it("poza szkołą: widoczne, bez przypomnień, nie jest brakiem, powrót przez Oddaję", async () => {
    const p = await E.markOutOfSchool(admin, 7, { email: ola.email, miejsce: "w domu", planowanyZwrot: "2026-11-03" });
    expect(p).toMatchObject({ status: "poza_szkola", ktoMa: "Ola Nowak", miejsce: "w domu", planowanyZwrot: "2026-11-03", jest: false });
    expect((await E.listEquipment("wypozyczone")).liczniki).toMatchObject({ poza: 1, pozaSzkola: 1, ponad24: 0 });
    await owner`update sprzet set od_kiedy = now() - interval '30 hours' where kod = 7`;
    await C.tick(new Date());
    expect((await mails()).filter((m) => m.rodzaj.startsWith("przyp"))).toHaveLength(0);
    const braki = await E.sendShortageReminders(admin);
    expect(braki.osoby).toBe(0);
    expect((await mails()).map((m) => m.rodzaj)).not.toContain("braki_osoba");
    const r = await E.performAction(ola, { kod: 7, akcja: "oddaje", requestId: rid() });
    expect(r.pozycja).toMatchObject({ status: "w_studiu", miejsce: null, planowanyZwrot: null });
    expect((await hist()).map((h) => h.akcja)).toEqual(["Poza szkołą", "Oddaję"]);
  });

  it("poza szkołą tylko dla zaakceptowanej osoby", async () => {
    await expect(E.markOutOfSchool(admin, 7, { email: "obcy@mti.edu.pl", miejsce: "w domu" })).rejects.toMatchObject({ code: "zla_osoba" });
  });

  // ---------- rezerwacje ----------
  const h = (n: number) => new Date(Date.now() + n * 3_600_000);
  it("rezerwacja: wniosek → dostępność → zatwierdzenie → konflikt blokowany przez bazę", async () => {
    const a = await R.createRequest(jan, { od: h(24), do: h(26), kody: [12], cel: "nagranie wywiadu" });
    expect(a.pozycje[0].stan).toBe("wolny");
    expect((await mails()).map((m) => m.rodzaj)).toEqual(["rezerwacja_nowa"]);
    const b = await R.createRequest(ola, { od: h(25), do: h(27), kody: [12, 112] });
    expect(b.pozycje.find((x) => x.kod === 12)?.stan).toBe("oczekuje");

    const list = await R.adminList();
    expect(list.oczekujace).toHaveLength(2);
    await R.decide(admin, a.id, "zatwierdz");
    const dost = await R.availability(h(25), h(27), { pomin: b.id });
    expect(dost.find((x) => x.kod === 12)).toMatchObject({ stan: "zajety" });
    await expect(R.decide(admin, b.id, "zatwierdz")).rejects.toMatchObject({ code: "konflikt" });
    await R.decide(admin, b.id, "odrzuc", "kamera zajęta");
    expect((await mails()).filter((m) => m.rodzaj === "rezerwacja_decyzja").map((m) => m.do)).toEqual([jan.email, ola.email]);
    // nowy wniosek na zajęty czas jest odrzucany od razu
    await expect(R.createRequest(ola, { od: h(25), do: h(25.5), kody: [12] })).rejects.toMatchObject({ code: "zajete" });
    // tuż po końcu — wolne
    expect((await R.createRequest(ola, { od: h(26), do: h(27), kody: [12] })).pozycje[0].stan).toBe("wolny");
  });

  it("rezerwacja: walidacja czasu, anulowanie, wygasanie", async () => {
    await expect(R.createRequest(jan, { od: h(-2), do: h(-1), kody: [12] })).rejects.toMatchObject({ code: "przeszlosc" });
    await expect(R.createRequest(jan, { od: h(2), do: h(1), kody: [12] })).rejects.toMatchObject({ code: "zla_data" });
    await expect(R.createRequest(jan, { od: h(1), do: h(24 * 20), kody: [12] })).rejects.toMatchObject({ code: "za_dlugo" });
    const a = await R.createRequest(jan, { od: h(5), do: h(6), kody: [7] });
    await expect(R.cancelReservation(ola, a.id)).rejects.toMatchObject({ code: "nie_ma" });
    await R.cancelReservation(jan, a.id);
    expect((await R.myReservations(jan.oid))[0].status).toBe("anulowana");
    const b = await R.createRequest(jan, { od: h(0.1), do: h(1), kody: [7] });
    expect(await R.expirePending(h(0.2))).toBe(1);
    expect((await R.myReservations(jan.oid)).find((x) => x.id === b.id)?.status).toBe("wygasla");
  });

  it("Biorę ostrzega, gdy sprzęt jest teraz zarezerwowany dla kogoś innego; poza szkołą widać w dostępności", async () => {
    const a = await R.createRequest(ola, { od: h(0), do: h(2), kody: [12] });
    await R.decide(admin, a.id, "zatwierdz");
    const r = await E.performAction(jan, { kod: 12, akcja: "biore", requestId: rid() });
    expect(r.ostrzezenie).toContain("zarezerwowane dla Ola Nowak");
    const l = await E.listEquipment();
    expect(l.lista.find((x) => x.kod === 12)?.rezerwacja?.imie).toBe("Ola Nowak");
    await E.markOutOfSchool(admin, 7, { email: jan.email, miejsce: "w domu" });
    expect((await R.availability(h(3), h(4))).find((x) => x.kod === 7)?.stan).toBe("poza_szkola");
  });
});
