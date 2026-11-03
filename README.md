# Studio wideo — aplikacja webowa

PWA na telefon zastępująca formularz Forms, aplikację Power Apps i 8 przepływów Power Automate. Biorę / Oddaję / Sprawdzam, inwentaryzacja, przypomnienia, check-in / check-out, rezerwacje („Zajmij”), sprzęt poza szkołą, panel administratora. Logowanie wyłącznie szkolnym kontem Microsoft (`@mti.edu.pl`), a każda nowa osoba czeka na akceptację administratora.

## Dostęp i role

- **Akceptacja**: pierwsze logowanie zapisuje osobę jako „czeka na akceptację” i wysyła mail do administratorów. Do akceptacji sesja w ogóle nie powstaje, a każdy endpoint i tak odpowiada 403. Po akceptacji osoba dostaje maila. Odrzucenie = blokada.
- **Role**: administrator nadaje i odbiera rolę administratora w Panel → Użytkownicy (musi zostać co najmniej jeden). Może też dodać osobę z góry (e-mail, imię, rola) — wtedy przy pierwszym logowaniu nie czeka.
- **Administratorzy startowi**: rola `Studio.Admin` w Entra albo `ADMIN_EMAILS` — zawsze aktywni, nie da się ich zdegradować z panelu.

## Poza szkołą i rezerwacje

- **Poza szkołą**: administrator oznacza sprzęt (dla siebie albo innej osoby) z miejscem i opcjonalnym terminem zwrotu — w Skanerze („Poza szkołą”), w Panel → Sprzęt albo w panelu sprzętu. Widać to wszędzie na niebiesko; po terminie — na czerwono i w „Wymaga uwagi”. Bez przypomnień 6 h / 19:00, nie jest brakiem w inwentaryzacji, jest w raporcie 15:30. Powrót: zwykłe „Oddaję”.
- **Zajmij**: każdy wybiera termin i sprzęt (`/zajmij`), widzi dostępność na te godziny, wysyła wniosek. Administrator w Panel → Rezerwacje widzi każdą pozycję: dostępny / zajęty / poza szkołą / teraz u kogoś / inne wnioski — i zatwierdza albo odmawia z powodem. Osoba dostaje maila. Dwie zatwierdzone rezerwacje tego samego sprzętu nie mogą się nakładać — pilnuje tego ograniczenie w bazie (`exclude using gist`). Nierozpatrzone wnioski wygasają z początkiem terminu. Biorę na sprzęt zarezerwowany dla kogoś innego pokazuje ostrzeżenie.

Next.js 16 (App Router) · TypeScript · Tailwind 4 · PostgreSQL + Drizzle · Auth.js + Entra ID · Upstash Redis · Microsoft Graph · Vercel (fra1) + Firewall + BotID.

## Co gdzie jest

| Ścieżka | Zawartość |
| --- | --- |
| `src/proxy.ts` | CSP z nonce, szybkie 401 dla `/api`, przekierowanie na `/login` |
| `src/lib/guard.ts` | Każdy endpoint: CSRF → BotID → sesja → blokada konta → rola → limity → bezpieczne błędy |
| `src/lib/auth.ts`, `claims.ts` | Logowanie Entra, sprawdzenie `tid`, `oid` i domeny, zapis użytkownika, audyt |
| `src/lib/equipment.ts` | Biorę / Oddaję / Sprawdzam w transakcji (`FOR UPDATE`), inwentaryzacja, braki, Przypomnij |
| `src/lib/attendance.ts` | Check-in (HMAC kodu drzwi), check-out ze sprzętem, zamknięcie wizyty przez admina |
| `src/lib/cron.ts` | Tick co 15 min: raport 15:30, przypomnienia 6 h i 19:00, auto check-out 21:00, retencja |
| `src/lib/mail.ts`, `templates.ts` | Kolejka `mail_outbox`, wysyłka Graph z ponawianiem, **wszystkie treści maili** |
| `src/app/(app)/*` | Ekrany telefonu: Start, Skaner, Wypożyczone, Inwentaryzacja, Obecność, `/c` (check-in), `/wyjscie` |
| `src/app/admin/*` | Panel: Pulpit, Historia, Sprzęt (+ naklejki QR), Obecności, Użytkownicy, Audyt, Ustawienia |
| `src/app/kiosk` | Etap 2: tablet przy drzwiach z kodem zmieniającym się co 30 s |
| `drizzle/0001_init.sql` | Schemat, indeksy, konto `studio_app` bez UPDATE/DELETE na historii i audycie |
| `scripts/import-sharepoint.ts` | Import list Sprzęt i Historia z CSV |
| `scripts/supabase-cron.sql` | Harmonogram dla planu Hobby (pg_cron woła `/api/cron/tick`) |
| `src/lib/reservations.ts`, `users.ts` | Rezerwacje (dostępność, wnioski, decyzje, wygasanie) i akceptacja osób przy logowaniu |
| `tests/` | 25 testów jednostkowych + 22 integracyjne na prawdziwym PostgreSQL |

## Wdrożenie krok po kroku

### 1. Z administratorem M365 szkoły (najpierw — to blokuje resztę)

**Rejestracja aplikacji w Entra** (Microsoft Entra admin center → App registrations → New):
- *Accounts in this organizational directory only* (single-tenant).
- Redirect URI (Web): `https://<domena>/api/auth/callback/microsoft-entra-id` (+ `http://localhost:3000/...` do testów).
- API permissions → delegowane: `openid`, `profile`, `email`, `User.Read`. Aplikacyjne: `Mail.Send` (zgoda administratora).
- App roles → nowa rola `Studio.Admin` (Users/Groups), przypisana Tobie w Enterprise applications.
- Opcjonalnie: *Assignment required* = Yes i grupa „Studio wideo – użytkownicy”.
- Certificates & secrets → client secret (zanotuj datę wygaśnięcia).
- Potwierdź Tenant ID (plan zakłada `cdeca4b5-…`).

**Skrzynka studia** (np. `studio@mti.edu.pl`) i zawężenie `Mail.Send` tylko do niej (Exchange Online PowerShell, RBAC for Applications):

```powershell
New-ServicePrincipal -AppId <client-id> -ObjectId <object-id-z-Enterprise-apps> -DisplayName "Studio wideo"
New-DistributionGroup -Name "Studio app scope" -Type Security -Members studio@mti.edu.pl
New-ManagementScope -Name "Studio mailbox" -RecipientRestrictionFilter "MemberOfGroup -eq '<DN grupy>'"
New-ManagementRoleAssignment -App <client-id> -Role "Application Mail.Send" -CustomResourceScope "Studio mailbox"
```
Wtedy w Entra **nie** nadawaj `Mail.Send` w API permissions (uprawnienie przychodzi z Exchange) — albo usuń je po teście.

### 2. Baza i Redis
1. Vercel → Storage / Marketplace → Supabase (albo Neon), region **Frankfurt**; Upstash Redis.
2. Lokalnie: `DATABASE_URL_ADMIN=… npm run db:migrate` (migracja 0002 włącza rozszerzenie `btree_gist` — w Supabase jest dostępne).
3. Hasło konta aplikacji: `alter role studio_app password '…';` → `DATABASE_URL` z tym kontem
   (pooler Supabase: użytkownik `studio_app.<project-ref>`, port 6543).

### 3. Vercel
1. Repozytorium GitHub → nowy projekt na Vercelu. Zmienne z `.env.example` (bez `DATABASE_URL_ADMIN`).
2. Firewall → Bot Protection (managed ruleset) włączone; BotID Deep Analysis jeśli dostępne;
   reguła rate limit na `/api/*`: 600 / min / IP; opcjonalnie reguła blokująca kraje spoza UE na `/api/*`.
3. Domena: jeśli DNS jest w Cloudflare — tylko tryb DNS (szara chmurka), bez proxy.
4. Harmonogram:
   - **Hobby**: `scripts/supabase-cron.sql` (podmień adres i sekret).
   - **Pro**: zamień `vercel.json` na `vercel.pro.json`.

### 4. Import z SharePoint
Eksport list „Sprzęt” i „Historia” do CSV (Lista → Eksportuj → CSV), potem:
```bash
npm run import:sharepoint -- --sprzet Sprzet.csv --historia Historia.csv            # podgląd i kontrola
npm run import:sharepoint -- --sprzet Sprzet.csv --historia Historia.csv --zapisz   # zapis
```
Kody od 101 w górę są traktowane jako sprzęt bez QR (jak w Power Apps), chyba że CSV ma kolumnę QR.

### 5. Pilotaż i przełączenie
1. Pilotaż równoległy z `MAIL_DISABLED=1` — przepływy dalej wysyłają maile, aplikacja tylko loguje.
2. **Przed przełączeniem: porównaj teksty maili w `src/lib/templates.ts` z przepływami 2, 3 i C i podmień 1:1.**
3. Dzień przełączenia: końcowy import Historii (`--historia-od <data>`), wyłączenie przepływów 2 i 3 **w tym samym momencie** co włączenie harmonogramu i `MAIL_DISABLED=0`, druk naklejek (Panel → Sprzęt → Drukuj naklejki QR) i kodu drzwi (Panel → Ustawienia), zamknięcie Forms z linkiem do aplikacji.

## Demo na GitHub Pages

Pełna aplikacja potrzebuje serwera (API, PostgreSQL, logowanie Microsoft), więc na GitHub Pages działa **statyczne demo** na danych przykładowych: te same ekrany telefonu i panel administratora, ale bez logowania, bazy i maili. Dane zapisują się tylko w przeglądarce; przycisk „DEMO” u góry przełącza rolę, symuluje skan kodu drzwi i resetuje dane. Prawdziwy podgląd z bazą i logowaniem daje Vercel (sekcja „Wdrożenie”).

- Włączenie: Settings → Pages → Build and deployment → Source: **GitHub Actions**. Każdy push na `main` buduje i publikuje demo (`.github/workflows/pages.yml`), adres: `https://<konto>.github.io/<repozytorium>/`.
- Lokalnie: `npm ci && npm run build:demo && npm run serve:demo` → http://localhost:4173/studio_check/
- Jak to działa: `scripts/build-demo.mjs` buduje kopię aplikacji w `.demo/` (bez tras `/api`, proxy i BotID), nakłada pliki z `demo/overlay/` i podmienia `api()` na atrapę z `demo/overlay/src/lib/demo-mock.ts`. Kod produkcyjny w `src/` zostaje bez zmian, więc ekrany w demo to zawsze aktualne ekrany aplikacji. Zmiana kształtu odpowiedzi API wymaga poprawki atrapy.

## Testy

```bash
npm test                                   # testy jednostkowe
TEST_DATABASE_URL=postgres://studio_app:…@localhost/studio \
TEST_DATABASE_URL_ADMIN=postgres://postgres@localhost/studio npm test   # + integracyjne (czyszczą tabele!)
node scripts/smoke.mjs                     # test HTTP działającego serwera na :3100 (lokalna baza)
```

Pokryte: wszystkie gałęzie akcji, nieznany kod, przejęcie, podwójne kliknięcie, dwie osoby naraz, escapowanie uwag w mailach, inwentaryzacja i braki, check-in (zły token, podwójny, w ciszy), check-out ze sprzętem, jedna otwarta wizyta w bazie, cron (6 h raz, 19:00 raz, 21:00 auto check-out, raport raz, 6 h w ciszy → 7:00, zmiana czasu), uprawnienia bazy, CSRF, 401/403/429, nagłówki i nonce, blokada konta.

Do zrobienia ręcznie po wdrożeniu: skan na iPhonie (Safari) i Androidzie (Chrome), prawdziwe logowanie kontem szkolnym i prywatnym (odrzucenie), wysyłka maili przez Graph, Mozilla Observatory i OWASP ZAP baseline.

## Przyjęte decyzje (z planu, zmienialne)

| Decyzja | Ustawione | Gdzie zmienić |
| --- | --- | --- |
| Start inwentaryzacji i maile o brakach | tylko administrator | Panel → Ustawienia |
| Check-in 21:00–7:00 | odrzucany | Panel → Ustawienia |
| Godziny ciszy | 21:00–7:00 | Panel → Ustawienia |
| Kod drzwi | naklejka; kiosk gotowy (`/kiosk`) | Panel → Ustawienia |
| Retencja obecności | 12 miesięcy, potem anonimizacja | `ATTENDANCE_RETENTION_MONTHS` (potwierdzić z IOD) |
| Kto się loguje | konto mti.edu.pl **po akceptacji administratora** | Panel → Użytkownicy |
