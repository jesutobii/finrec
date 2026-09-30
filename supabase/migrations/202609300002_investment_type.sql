-- FinRec: track investment contributions separately from day-to-day expenditure.
-- Run this migration once in Supabase SQL Editor.

alter table public.transactions
drop constraint if exists transactions_type_check;

alter table public.transactions
add constraint transactions_type_check
check (type in ('income','expense','investment'));

alter table public.categories
drop constraint if exists categories_type_check;

alter table public.categories
add constraint categories_type_check
check (type in ('income','expense','investment'));

insert into public.categories (user_id, name, type, icon)
values
  (null, 'Investments', 'investment', 'trending-up')
on conflict do nothing;

create index if not exists idx_transactions_user_type_date
on public.transactions(user_id, type, transaction_date desc);
