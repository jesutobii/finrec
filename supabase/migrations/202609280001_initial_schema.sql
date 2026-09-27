-- FinRec initial schema
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  default_currency text not null default 'NGN' check (char_length(default_currency) = 3),
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  type text not null default 'cash' check (type in ('cash','bank','card','mobile_money','other')),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  opening_balance numeric(19,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  type text not null check (type in ('income','expense')),
  icon text,
  created_at timestamptz not null default now(),
  unique(user_id, name, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(19,4) not null check (amount > 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  transaction_date date not null default current_date,
  description text,
  payment_method text,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  month date not null,
  amount numeric(19,4) not null check (amount >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  unique(user_id, category_id, month)
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(19,4) not null check (amount > 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  next_date date not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_categories_user on public.categories(user_id);
create index if not exists idx_transactions_user_date on public.transactions(user_id, transaction_date desc);
create index if not exists idx_transactions_user_type on public.transactions(user_id, type);
create index if not exists idx_transactions_category on public.transactions(category_id);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month);
create index if not exists idx_recurring_user_next_date on public.recurring_transactions(user_id, next_date);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_transactions enable row level security;

-- Profiles
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- User-owned resources
create policy "accounts_own" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_own" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_own" on public.recurring_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Categories: NULL user_id means a read-only system category.
create policy "categories_select_own_or_system" on public.categories for select
  using (user_id is null or auth.uid() = user_id);
create policy "categories_insert_own" on public.categories for insert
  with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.categories (user_id, name, type, icon) values
  (null, 'Salary', 'income', 'briefcase'),
  (null, 'Freelance', 'income', 'laptop'),
  (null, 'Other income', 'income', 'plus-circle'),
  (null, 'Food & groceries', 'expense', 'shopping-cart'),
  (null, 'Transport', 'expense', 'car'),
  (null, 'Housing', 'expense', 'home'),
  (null, 'Utilities', 'expense', 'zap'),
  (null, 'Health', 'expense', 'heart-pulse'),
  (null, 'Education', 'expense', 'book-open'),
  (null, 'Entertainment', 'expense', 'film'),
  (null, 'Shopping', 'expense', 'shopping-bag'),
  (null, 'Subscriptions', 'expense', 'repeat'),
  (null, 'Other expense', 'expense', 'more-horizontal')
on conflict do nothing;
