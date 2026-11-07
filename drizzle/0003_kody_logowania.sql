-- 0003: logowanie jednorazowym kodem wysyłanym na szkolny adres e-mail (bez Entra ID).
-- Jeden aktywny kod na adres; w bazie jest tylko skrót (HMAC), nigdy sam kod.

create table if not exists kody_logowania (
  email      text primary key check (email = lower(email)),
  kod_hash   text not null,
  imie       text not null default '',
  wygasa     timestamptz not null,
  proby      integer not null default 0,
  utworzono  timestamptz not null default now()
);

grant select, insert, update, delete on kody_logowania to studio_app;
