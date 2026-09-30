-- FinRec: add distinct income categories for tutoring and gifts.
-- Run this migration once in Supabase SQL Editor.

insert into public.categories (user_id, name, type, icon)
values
  (null, 'Tutoring', 'income', 'graduation-cap'),
  (null, 'Gifts', 'income', 'gift')
on conflict do nothing;
