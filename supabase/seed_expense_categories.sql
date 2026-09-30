-- Additional expense categories requested for FinRec.
-- Run this once in the Supabase SQL editor. The insert is idempotent.
insert into public.categories (name, type)
select name, 'expense'
from (values ('Tithe'), ('Offering'), ('Seed')) as v(name)
where not exists (
  select 1 from public.categories c
  where c.name = v.name and c.type = 'expense'
);
