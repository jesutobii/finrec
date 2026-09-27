create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  default_currency text not null default 'NGN' check (char_length(default_currency) = 3),
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  type text not null default 'cash' check (type in ('cash','bank','card','savings','other')),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  opening_balance numeric(19,4) not null default 0,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  type text not null check (type in ('income','expense')),
  icon text,
  created_at timestamptz not null default now(),
  unique(user_id, name, type)
);

create table public.transactions (
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

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  amount numeric(19,4) not null check (amount >= 0),
  currency text not null default 'NGN' check (char_length(currency) = 3),
  unique(user_id, category_id, month)
);

create table public.recurring_transactions (
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
  created_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_user_type_idx on public.transactions(user_id, type);
create index budgets_user_month_idx on public.budgets(user_id, month);
create index recurring_user_next_date_idx on public.recurring_transactions(user_id, next_date) where active = true;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_transactions enable row level security;

create policy "profiles own row" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "accounts own rows" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories own rows" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions own rows" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets own rows" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring own rows" on public.recurring_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.categories (user_id, name, type)
select id, category, type
from auth.users
cross join (values
  ('Food','expense'),('Transport','expense'),('Bills','expense'),('Housing','expense'),('Health','expense'),('Shopping','expense'),('Entertainment','expense'),('Other','expense'),('Salary','income'),('Business','income'),('Other income','income')
) as defaults(category,type)
on conflict do nothing;
