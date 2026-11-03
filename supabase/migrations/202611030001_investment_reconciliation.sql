-- Monthly investment valuations, separate from spendable cash balances.
create table if not exists public.investment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  opening_value numeric(19,4) not null default 0 check (opening_value >= 0),
  actual_closing_value numeric(19,4) not null default 0 check (actual_closing_value >= 0),
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

alter table public.investment_reconciliations enable row level security;
create policy investment_reconciliations_own on public.investment_reconciliations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.investment_reconciliations to authenticated;
