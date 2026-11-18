-- Addendum 164: which year groups a school takes (Nov 2026)
-- Lets Suggested schools leave out a school that doesn't teach the child's
-- year group (for example a primary school for a Year 9 child). Both are
-- empty until someone fills them in on the school record; a school with
-- them empty is never filtered out. Values are the year group names the
-- family form uses (FS1 / Pre-KG / Nursery ... Year 13 / Grade 12).
-- Safe to run more than once.

alter table public.schools
  add column if not exists lowest_year_group text,
  add column if not exists highest_year_group text;

comment on column public.schools.lowest_year_group is
  'Youngest year group the school takes, as named on the family form. Null = not recorded. See addendum 164.';
comment on column public.schools.highest_year_group is
  'Oldest year group the school takes, as named on the family form. Null = not recorded. See addendum 164.';

notify pgrst, 'reload schema';
