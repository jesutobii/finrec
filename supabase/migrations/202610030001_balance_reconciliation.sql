-- FinRec account reconciliation support.
-- Run this migration once in the Supabase SQL Editor.

create table if not exists public.balance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  opening_balance numeric(19,4) not null default 0,
  actual_closing_balance numeric(19,4) not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, month)
);

create index if not exists idx_balance_reconciliations_user_month
  on public.balance_reconciliations(user_id, month desc);

alter table public.balance_reconciliations enable row level security;
drop policy if exists "balance_reconciliations_own" on public.balance_reconciliations;
create policy "balance_reconciliations_own"
  on public.balance_reconciliations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.balance_reconciliations to authenticated;
