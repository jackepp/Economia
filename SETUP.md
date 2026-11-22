# money-dash – installation

Appen är en enda sida (`index.html`) som sparar data i Supabase. Koden ligger i ett publikt GitHub-repo och publiceras med GitHub Pages på
<https://jackepp.github.io/money-dash/>. Ingen data finns i repot – den ligger i Supabase bakom inloggning.

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
2. **Settings → Pages** → *Build and deployment*: Source **Deploy from a branch**,
   Branch **main** och mapp **/ (root)** → **Save**.
3. Efter en minut eller två finns appen på <https://jackepp.github.io/money-dash/>.
   Varje push till `main` publiceras automatiskt.
4. I Supabase: **Authentication → URL Configuration → Site URL** = `https://jackepp.github.io/money-dash/`.

## 4. iPhone

Öppna adressen i **Safari** → **Dela** → **Lägg till på hemskärmen**. Logga in en gång.

## Säkerhet

- `SUPABASE_KEY` i `index.html` är den **publika** nyckeln (publishable) och får ligga i koden.
  Skyddet är inloggningen + Row Level Security.
- Lägg **aldrig** in `service_role`- eller `sb_secret_`-nyckeln i koden.
- Kontoutdrag (`.pdf`, `.csv`) och säkerhetskopior (`.json`) är blockerade i `.gitignore`.
