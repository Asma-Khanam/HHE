-- Addendum 165: KHDA inspection result on the school record (Nov 2026)
-- For the AI school shortlist: it may only use independent, verified facts
-- (the school's own website and KHDA inspection results), not opinions.
-- The KHDA rating is stored with the inspection year and a link to the
-- published report, so anyone can check it. A rating with no report link
-- is shown on the record but is not used by Suggested schools.
-- Dubai schools only: other emirates have their own inspectors, so leave
-- these empty for them. Safe to run more than once.

alter table public.schools
  add column if not exists khda_rating text,
  add column if not exists khda_inspection_year text,
  add column if not exists khda_report_url text;

alter table public.schools drop constraint if exists schools_khda_rating_check;
alter table public.schools add constraint schools_khda_rating_check
  check (khda_rating is null or khda_rating in ('outstanding', 'very_good', 'good', 'acceptable', 'weak', 'very_weak'));

comment on column public.schools.khda_rating is
  'KHDA (Dubai) overall inspection rating: outstanding, very_good, good, acceptable, weak, very_weak. Null = not recorded. See addendum 165.';
comment on column public.schools.khda_inspection_year is
  'Academic year of the KHDA inspection the rating comes from, for example 2024-25. See addendum 165.';
comment on column public.schools.khda_report_url is
  'Link to the published KHDA report. A rating without a link is not used by Suggested schools. See addendum 165.';

notify pgrst, 'reload schema';
