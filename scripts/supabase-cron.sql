-- Harmonogram dla planu Vercel Hobby (Vercel Cron działa tam najwyżej raz dziennie).
-- Uruchom raz w SQL Editorze Supabase (konto właściciela). Wymaga rozszerzeń pg_cron i pg_net.
-- Podmień ADRES i SEKRET. Sekret trzymamy w Vault, nie w treści zadania.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('SEKRET_CRON_TUTAJ', 'studio_cron_secret');

-- Co 15 minut: raport, przypomnienia, auto check-out, retencja, kolejka maili.
select cron.schedule(
  'studio-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://ADRES-APLIKACJI/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'studio_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Co minutę: tylko kolejka maili (maile z akcji wychodzą od razu; to jest zapas na ponowienia).
select cron.schedule(
  'studio-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ADRES-APLIKACJI/api/cron/outbox',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'studio_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Podgląd: select * from cron.job;   historia: select * from cron.job_run_details order by start_time desc limit 20;
-- Wyłączenie: select cron.unschedule('studio-tick'); select cron.unschedule('studio-outbox');
