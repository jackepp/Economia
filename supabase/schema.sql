-- money-dash: tabeller och säkerhetsregler
-- Kör en gång i Supabase → SQL Editor → New query → klistra in → Run.
-- Säkert att köra igen (allt är "if not exists" / ersätts).

-- Transaktioner: en rad per transaktion, kopplad till inloggad användare
create table if not exists public.transactions (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null,                -- appens dubblettnyckel (källa|datum|belopp|text#n)
  date        date not null,
  description text not null default '',
  kind        text,                         -- transaktionstyp från banken, t.ex. "Kortköp/uttag"
  amount      numeric(14,2) not null,
  currency    text not null default 'SEK',
  source      text,                         -- Swedbank / Revolut
  category_id text,
  manual      boolean not null default false,
  hint        text,
  alias       text,                         -- eget namn
  note        text,                         -- anteckning
  mark        text,                         -- markering
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date);

-- Inställningar: kategorier, regler, mottagarnamn m.m. som ett JSON-dokument per användare
create table if not exists public.app_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: varje användare ser och ändrar bara sina egna rader
alter table public.transactions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own settings" on public.app_settings;
create policy "own settings" on public.app_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Behörigheter: bara inloggade användare, ingen åtkomst alls utan inloggning
revoke all on public.transactions, public.app_settings from anon;
grant select, insert, update, delete on public.transactions, public.app_settings to authenticated;
