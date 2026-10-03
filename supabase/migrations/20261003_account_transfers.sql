-- Track money moved between a user's own savings/investment funds and cash.
-- Transfers are not income and are not expenses by themselves.

create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_date date not null,
  amount numeric(19,4) not null check (amount > 0),
  from_account text not null check (from_account in ('savings', 'investment')),
  to_account text not null default 'cash' check (to_account = 'cash'),
  purpose text,
  expense_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_transfers_user_date
  on public.account_transfers(user_id, transfer_date desc);

alter table public.account_transfers enable row level security;

drop policy if exists "account_transfers_own" on public.account_transfers;
create policy "account_transfers_own"
  on public.account_transfers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.account_transfers to authenticated;

create or replace function public.create_expense_from_funding(
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_transaction_date date,
  p_description text,
  p_category_id uuid,
  p_funding_source text
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_transfer public.account_transfers;
begin
  if p_funding_source not in ('savings', 'investment') then
    raise exception 'Funding source must be savings or investment';
  end if;

  insert into public.transactions(user_id, type, amount, currency, transaction_date, description, category_id)
  values (p_user_id, 'expense', p_amount, p_currency, p_transaction_date, p_description, p_category_id)
  returning * into v_transaction;

  insert into public.account_transfers(user_id, transfer_date, amount, from_account, purpose, expense_transaction_id)
  values (p_user_id, p_transaction_date, p_amount, p_funding_source, p_description, v_transaction.id)
  returning * into v_transfer;

  return json_build_object('transaction', row_to_json(v_transaction), 'transfer', row_to_json(v_transfer));
end;
$$;

grant execute on function public.create_expense_from_funding(uuid,numeric,text,date,text,uuid,text) to authenticated;
