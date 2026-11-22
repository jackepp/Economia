# money-dash – installation

Appen är byggd med Vite + TypeScript och sparar data i Supabase. Koden ligger i ett publikt GitHub-repo och publiceras
med GitHub Pages på <https://jackepp.github.io/money-dash/>. Ingen data finns i repot – den ligger i Supabase bakom inloggning.

## 1. Supabase: skapa tabellerna (en gång)

1. Öppna projektet på supabase.com → **SQL Editor** → **New query**.
2. Klistra in hela innehållet i [`supabase/schema.sql`](supabase/schema.sql) och klicka **Run**.
   Det skapar tabellerna `transactions` och `app_settings` och slår på Row Level Security,
   så att varje inloggad användare bara kan läsa och ändra sina egna rader.

## 2. Supabase: skapa ditt konto (en gång)

1. **Authentication → Users → Add user → Create new user**.
2. Fyll i e-post och ett starkt lösenord, och kryssa i **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: stäng av **Allow new users to sign up**.
   **Viktigt** eftersom koden är publik: annars kan vem som helst skapa ett konto i ditt projekt
   (de skulle bara se sina egna tomma rader, men kunna använda ditt databasutrymme).

## 3. GitHub Pages: publicera appen

1. Repot → **Settings → General** → längst ner under *Danger Zone* → **Change visibility → Public**.
2. **Settings → Pages** → *Build and deployment* → Source: **GitHub Actions**.
3. Varje push till `main` kör testerna, bygger och publicerar (se fliken **Actions**). Efter ett par minuter finns
   appen på <https://jackepp.github.io/money-dash/>.
4. I Supabase: **Authentication → URL Configuration → Site URL** = `https://jackepp.github.io/money-dash/`.

## 4. iPhone

Öppna adressen i **Safari** → **Dela** → **Lägg till på hemskärmen**. Logga in en gång.

## Utveckling

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # enhetstester
npm run build      # typkontroll + bygge till dist/
```

Kontrollera läsarna mot riktiga kontoutdrag (filerna stannar utanför repot):

```powershell
$env:SWB_PDF='C:\sökväg\swedbank.pdf'; $env:REV_PDF='C:\sökväg\revolut.pdf'; npm test
```

| Fil | Innehåll |
| --- | --- |
| `src/main.ts` | Start, sidhuvud, flikar, filsläpp |
| `src/state.ts` | Datamodell, standardkategorier, migreringar, summor |
| `src/rules.ts` | Standardregler, normalisering av mottagare, automatisk kategorisering |
| `src/sync.ts` | Supabase: inloggning, hämtning och diff-synk |
| `src/import/` | Läsare för CSV, Swedbank-PDF/text och Revolut-PDF |
| `src/views/` | Översikt, Sortera, Transaktioner, Inställningar, Import, Redigera |

## Säkerhet

- `SUPABASE_KEY` i `src/config.ts` är den **publika** nyckeln (publishable) och får ligga i koden.
  Skyddet är inloggningen + Row Level Security.
- Lägg **aldrig** in `service_role`- eller `sb_secret_`-nyckeln i koden.
- Kontoutdrag (`.pdf`, `.csv`) och säkerhetskopior (`.json`) är blockerade i `.gitignore`.
