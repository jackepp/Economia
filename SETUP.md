# money-dash – installation

Appen är en enda sida (`index.html`) som sparar data i Supabase. Koden ligger i ett privat GitHub-repo och publiceras med Cloudflare Pages.

## 1. Supabase: skapa tabellerna (en gång)

1. Öppna projektet på supabase.com → **SQL Editor** → **New query**.
2. Klistra in hela innehållet i [`supabase/schema.sql`](supabase/schema.sql) och klicka **Run**.
   Det skapar tabellerna `transactions` och `app_settings` och slår på Row Level Security,
   så att varje inloggad användare bara kan läsa och ändra sina egna rader.

## 2. Supabase: skapa ditt konto (en gång)

1. **Authentication → Users → Add user → Create new user**.
2. Fyll i e-post och ett starkt lösenord, och kryssa i **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: stäng av **Allow new users to sign up**,
   så att ingen annan kan skapa ett konto.

## 3. Cloudflare Pages: publicera appen

1. Skapa ett gratiskonto på cloudflare.com.
2. **Compute (Workers & Pages) → Create → Pages → Connect to Git** → välj GitHub-repot `money-dash`
   (ge Cloudflare åtkomst till just det repot).
3. Inställningar för bygget:
   - Framework preset: **None**
   - Build command: *(tomt)*
   - Build output directory: `/`
4. **Save and Deploy**. Du får en adress som `https://money-dash-xxx.pages.dev`.
   Varje gång koden pushas till `main` publiceras en ny version automatiskt.
5. I Supabase: **Authentication → URL Configuration → Site URL** = adressen från steg 4.

### Valfritt: lås hela sidan bakom inloggning (Cloudflare Access)

**Zero Trust → Access → Applications → Add an application → Self-hosted**, ange adressen ovan
och en policy *Include → Emails → din e-post*. Då måste man ange en engångskod från e-posten
innan sidan ens laddas.

## 4. iPhone

Öppna adressen i **Safari** → **Dela** → **Lägg till på hemskärmen**. Logga in en gång.

## Säkerhet

- `SUPABASE_KEY` i `index.html` är den **publika** nyckeln (publishable) och får ligga i koden.
  Skyddet är inloggningen + Row Level Security.
- Lägg **aldrig** in `service_role`- eller `sb_secret_`-nyckeln i koden.
- Kontoutdrag (`.pdf`, `.csv`) och säkerhetskopior (`.json`) är blockerade i `.gitignore`.
