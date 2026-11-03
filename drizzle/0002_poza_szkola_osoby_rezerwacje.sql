-- 0002: sprzęt poza szkołą, akceptacja osób i role, rezerwacje („Zajmij”).

-- ---------- Sprzęt poza szkołą ----------
alter table sprzet drop constraint if exists sprzet_status_check;
alter table sprzet add constraint sprzet_status_check check (status in ('w_studiu', 'wypozyczony', 'poza_szkola'));
alter table sprzet add column if not exists miejsce text;                 -- np. „w domu”
alter table sprzet add column if not exists planowany_zwrot date;          -- opcjonalny termin zwrotu
alter table sprzet add column if not exists oznaczyl text;                 -- e-mail administratora, który oznaczył

-- ---------- Akceptacja osób i role nadawane przez administratora ----------
-- Każda nowa osoba po pierwszym logowaniu czeka na akceptację administratora.
-- Osoba dodana przez administratora przed pierwszym logowaniem ma tymczasowy oid „dodany:<email>”
-- i jest od razu zaakceptowana; przy pierwszym logowaniu wiersz dostaje prawdziwy oid z Entra.
alter table uzytkownicy add column if not exists zaakceptowany boolean not null default false;
alter table uzytkownicy add column if not exists zaakceptowal text;
alter table uzytkownicy add column if not exists zaakceptowano timestamptz;
alter table uzytkownicy add column if not exists dodal text;
alter table uzytkownicy alter column ostatnie_logowanie drop not null;
-- Konta istniejące przed tą migracją zostają aktywne.
update uzytkownicy set zaakceptowany = true, zaakceptowano = now() where not zaakceptowany;

-- ---------- Rezerwacje ----------
create extension if not exists btree_gist;

create table if not exists rezerwacje (
  id              bigserial primary key,
  user_oid        text not null,
  email           text not null,
  imie            text not null,
  od              timestamptz not null,
  "do"            timestamptz not null,
  cel             text check (cel is null or char_length(cel) <= 500),
  status          text not null default 'oczekuje' check (status in ('oczekuje', 'zatwierdzona', 'odrzucona', 'anulowana', 'wygasla')),
  decyzja_przez   text,
  decyzja_kiedy   timestamptz,
  powod           text check (powod is null or char_length(powod) <= 300),
  utworzono       timestamptz not null default now(),
  check ("do" > od)
);
create index if not exists rezerwacje_status_od_idx on rezerwacje (status, od);
create index if not exists rezerwacje_user_idx on rezerwacje (user_oid, od desc);

create table if not exists rezerwacje_sprzet (
  rezerwacja_id  bigint not null references rezerwacje(id) on delete cascade,
  kod            integer not null references sprzet(kod) on update cascade,
  okres          tstzrange not null,
  zatwierdzona   boolean not null default false,
  primary key (rezerwacja_id, kod),
  -- Baza nie pozwoli zatwierdzić dwóch rezerwacji tego samego sprzętu na nakładające się godziny.
  constraint rezerwacje_bez_nakladania exclude using gist (kod with =, okres with &&) where (zatwierdzona)
);
create index if not exists rezerwacje_sprzet_kod_idx on rezerwacje_sprzet using gist (kod, okres);

grant select, insert, update on rezerwacje, rezerwacje_sprzet to studio_app;
grant delete on rezerwacje_sprzet to studio_app;
grant usage, select on all sequences in schema public to studio_app;
