-- Studio wideo — schemat początkowy.
-- Uruchamiane kontem właściciela bazy (DATABASE_URL_ADMIN) przez `npm run db:migrate`.

create table if not exists sprzet (
  id              bigserial primary key,
  kod             integer not null check (kod >= 1),
  nazwa           text not null,
  kategoria       text not null default '',
  ma_qr           boolean not null default true,
  status          text not null default 'w_studiu' check (status in ('w_studiu','wypozyczony')),
  kto_ma          text,
  email           text,
  user_oid        text,
  od_kiedy        timestamptz,
  jest            boolean not null default true,
  sprawdzono      timestamptz,
  przyp_6h        timestamptz,
  przyp_19_dzien  date,
  zaktualizowano  timestamptz not null default now()
);
create unique index if not exists sprzet_kod_uq on sprzet (kod);
create index if not exists sprzet_status_idx on sprzet (status);
create index if not exists sprzet_email_idx on sprzet (email);

create table if not exists historia (
  id          bigserial primary key,
  kiedy       timestamptz not null default now(),
  nazwa       text not null,
  kod         integer,
  akcja       text not null,
  kto         text not null,
  email       text not null,
  user_oid    text,
  uwagi       text check (uwagi is null or char_length(uwagi) <= 500),
  zrodlo      text not null default 'aplikacja',
  request_id  uuid
);
create unique index if not exists historia_request_uq on historia (request_id);
create index if not exists historia_kod_kiedy_idx on historia (kod, kiedy desc);
create index if not exists historia_kiedy_idx on historia (kiedy desc);

create table if not exists uzytkownicy (
  oid                 text primary key,
  email               text not null check (email = lower(email)),
  imie                text not null default '',
  rola                text not null default 'uzytkownik' check (rola in ('uzytkownik','admin')),
  zablokowany         boolean not null default false,
  powod_blokady       text,
  pierwsze_logowanie  timestamptz not null default now(),
  ostatnie_logowanie  timestamptz not null default now()
);
create unique index if not exists uzytkownicy_email_uq on uzytkownicy (email);

create table if not exists obecnosci (
  id                   bigserial primary key,
  user_oid             text not null,
  email                text not null,
  imie                 text not null,
  wejscie              timestamptz not null default now(),
  wyjscie              timestamptz,
  zrodlo_wejscia       text not null,
  zrodlo_wyjscia       text,
  sprzet_przy_wyjsciu  integer[],
  zamknieta_przez      text,
  check (wyjscie is null or wyjscie >= wejscie)
);
-- Jedna otwarta wizyta na osobę.
create unique index if not exists obecnosci_otwarta_uq on obecnosci (user_oid) where wyjscie is null;
create index if not exists obecnosci_wejscie_idx on obecnosci (wejscie);

create table if not exists audyt (
  id          bigserial primary key,
  kiedy       timestamptz not null default now(),
  user_oid    text,
  zdarzenie   text not null,
  obiekt      text,
  szczegoly   jsonb,
  ip_skrot    text,
  wynik       text not null check (wynik in ('ok','odmowa','limit'))
);
create index if not exists audyt_kiedy_idx on audyt (kiedy desc);

create table if not exists mail_outbox (
  id              bigserial primary key,
  "do"            text not null,
  temat           text not null,
  tresc_html      text not null,
  rodzaj          text not null default 'inne',
  kod             integer,
  status          text not null default 'oczekuje' check (status in ('oczekuje','wyslany','blad')),
  proby           integer not null default 0,
  nastepna_proba  timestamptz not null default now(),
  ostatni_blad    text,
  utworzono       timestamptz not null default now(),
  wyslano         timestamptz
);
create index if not exists mail_outbox_kolejka_idx on mail_outbox (status, nastepna_proba);
create index if not exists mail_outbox_kod_idx on mail_outbox (kod);

create table if not exists ustawienia (
  klucz    text primary key,
  wartosc  jsonb not null
);

insert into ustawienia (klucz, wartosc) values
  ('kod_drzwi_wersja', '1'),
  ('cisza', '{"od": "21:00", "do": "07:00"}'),
  ('inwentaryzacja_tylko_admin', 'true'),
  ('checkin_w_ciszy', '"odrzucaj"')
on conflict (klucz) do nothing;

-- ---------------------------------------------------------------
-- Konto aplikacji: tylko to, czego potrzebuje. Historia i audyt
-- są dziennikami — bez UPDATE i DELETE.
-- Hasło ustawiasz osobno:  alter role studio_app password '...';
-- ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'studio_app') then
    create role studio_app login;
  end if;
end $$;

grant usage on schema public to studio_app;
grant select, insert, update, delete on sprzet, uzytkownicy, obecnosci, mail_outbox, ustawienia to studio_app;
grant select, insert on historia, audyt to studio_app;
revoke update, delete, truncate on historia, audyt from studio_app;
grant usage, select on all sequences in schema public to studio_app;

-- Anonimizacja obecności po okresie retencji to jedyna zmiana starych
-- danych osobowych; robi ją funkcja z prawami właściciela.
create or replace function anonimizuj_obecnosci(miesiace integer)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update obecnosci
     set user_oid = 'anon-' || id, email = 'anonim', imie = 'Anonim'
   where wejscie < now() - make_interval(months => miesiace)
     and email <> 'anonim'
     and wyjscie is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function anonimizuj_obecnosci(integer) from public;
grant execute on function anonimizuj_obecnosci(integer) to studio_app;
