-- Add Internet as a system-wide expense category for all FinRec users.
insert into public.categories (user_id, name, type, icon)
select null, 'Internet', 'expense', 'wifi'
where not exists (
  select 1
  from public.categories
  where user_id is null
    and name = 'Internet'
    and type = 'expense'
);
