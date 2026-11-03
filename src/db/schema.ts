import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const sprzet = pgTable(
  "sprzet",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kod: integer("kod").notNull(),
    nazwa: text("nazwa").notNull(),
    kategoria: text("kategoria").notNull().default(""),
    maQr: boolean("ma_qr").notNull().default(true),
    status: text("status", { enum: ["w_studiu", "wypozyczony", "poza_szkola"] }).notNull().default("w_studiu"),
    ktoMa: text("kto_ma"),
    email: text("email"),
    userOid: text("user_oid"),
    odKiedy: ts("od_kiedy"),
    jest: boolean("jest").notNull().default(true),
    sprawdzono: ts("sprawdzono"),
    przyp6h: ts("przyp_6h"),
    przyp19Dzien: date("przyp_19_dzien", { mode: "string" }),
    miejsce: text("miejsce"),
    planowanyZwrot: date("planowany_zwrot", { mode: "string" }),
    oznaczyl: text("oznaczyl"),
    zaktualizowano: ts("zaktualizowano").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sprzet_kod_uq").on(t.kod),
    index("sprzet_status_idx").on(t.status),
    index("sprzet_email_idx").on(t.email),
  ],
);

export const historia = pgTable(
  "historia",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kiedy: ts("kiedy").notNull().defaultNow(),
    nazwa: text("nazwa").notNull(),
    kod: integer("kod"),
    akcja: text("akcja").notNull(),
    kto: text("kto").notNull(),
    email: text("email").notNull(),
    userOid: text("user_oid"),
    uwagi: text("uwagi"),
    zrodlo: text("zrodlo").notNull().default("aplikacja"),
    requestId: uuid("request_id"),
  },
  (t) => [
    uniqueIndex("historia_request_uq").on(t.requestId),
    index("historia_kod_kiedy_idx").on(t.kod, t.kiedy.desc()),
    index("historia_kiedy_idx").on(t.kiedy.desc()),
  ],
);

export const uzytkownicy = pgTable(
  "uzytkownicy",
  {
    oid: text("oid").primaryKey(),
    email: text("email").notNull(),
    imie: text("imie").notNull().default(""),
    rola: text("rola", { enum: ["uzytkownik", "admin"] }).notNull().default("uzytkownik"),
    zablokowany: boolean("zablokowany").notNull().default(false),
    powodBlokady: text("powod_blokady"),
    zaakceptowany: boolean("zaakceptowany").notNull().default(false),
    zaakceptowal: text("zaakceptowal"),
    zaakceptowano: ts("zaakceptowano"),
    dodal: text("dodal"),
    pierwszeLogowanie: ts("pierwsze_logowanie").notNull().defaultNow(),
    ostatnieLogowanie: ts("ostatnie_logowanie"),
  },
  (t) => [uniqueIndex("uzytkownicy_email_uq").on(t.email)],
);

export const obecnosci = pgTable(
  "obecnosci",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userOid: text("user_oid").notNull(),
    email: text("email").notNull(),
    imie: text("imie").notNull(),
    wejscie: ts("wejscie").notNull().defaultNow(),
    wyjscie: ts("wyjscie"),
    zrodloWejscia: text("zrodlo_wejscia").notNull(),
    zrodloWyjscia: text("zrodlo_wyjscia"),
    sprzetPrzyWyjsciu: integer("sprzet_przy_wyjsciu").array(),
    zamknietaPrzez: text("zamknieta_przez"),
  },
  (t) => [
    uniqueIndex("obecnosci_otwarta_uq").on(t.userOid).where(sql`${t.wyjscie} is null`),
    index("obecnosci_wejscie_idx").on(t.wejscie),
  ],
);

export const audyt = pgTable(
  "audyt",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kiedy: ts("kiedy").notNull().defaultNow(),
    userOid: text("user_oid"),
    zdarzenie: text("zdarzenie").notNull(),
    obiekt: text("obiekt"),
    szczegoly: jsonb("szczegoly"),
    ipSkrot: text("ip_skrot"),
    wynik: text("wynik", { enum: ["ok", "odmowa", "limit"] }).notNull(),
  },
  (t) => [index("audyt_kiedy_idx").on(t.kiedy.desc())],
);

export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    do: text("do").notNull(),
    temat: text("temat").notNull(),
    trescHtml: text("tresc_html").notNull(),
    rodzaj: text("rodzaj").notNull().default("inne"),
    kod: integer("kod"),
    status: text("status", { enum: ["oczekuje", "wyslany", "blad"] }).notNull().default("oczekuje"),
    proby: integer("proby").notNull().default(0),
    nastepnaProba: ts("nastepna_proba").notNull().defaultNow(),
    ostatniBlad: text("ostatni_blad"),
    utworzono: ts("utworzono").notNull().defaultNow(),
    wyslano: ts("wyslano"),
  },
  (t) => [
    index("mail_outbox_kolejka_idx").on(t.status, t.nastepnaProba),
    index("mail_outbox_kod_idx").on(t.kod),
  ],
);

export const ustawienia = pgTable("ustawienia", {
  klucz: text("klucz").primaryKey(),
  wartosc: jsonb("wartosc").notNull(),
});

export const rezerwacje = pgTable("rezerwacje", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userOid: text("user_oid").notNull(),
  email: text("email").notNull(),
  imie: text("imie").notNull(),
  od: ts("od").notNull(),
  do: ts("do").notNull(),
  cel: text("cel"),
  status: text("status", { enum: ["oczekuje", "zatwierdzona", "odrzucona", "anulowana", "wygasla"] }).notNull().default("oczekuje"),
  decyzjaPrzez: text("decyzja_przez"),
  decyzjaKiedy: ts("decyzja_kiedy"),
  powod: text("powod"),
  utworzono: ts("utworzono").notNull().defaultNow(),
});

export const rezerwacjeSprzet = pgTable("rezerwacje_sprzet", {
  rezerwacjaId: bigserial("rezerwacja_id", { mode: "number" }).notNull(),
  kod: integer("kod").notNull(),
  // tstzrange — zapisywany przez surowe SQL w lib/reservations.ts
  okres: text("okres").notNull(),
  zatwierdzona: boolean("zatwierdzona").notNull().default(false),
});

export type Rezerwacja = typeof rezerwacje.$inferSelect;
export type Sprzet = typeof sprzet.$inferSelect;
export type Historia = typeof historia.$inferSelect;
export type Obecnosc = typeof obecnosci.$inferSelect;
