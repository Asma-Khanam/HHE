-- Addendum 160: school academics and inclusion fields (Nov 2026)
-- For the AI school shortlist: what a school teaches (GCSE and A-level
-- subjects, exam boards) and how well it supports different needs.
-- Location is not added here: the school already has an area and emirate,
-- and the shortlist works out travel from those (latitude/longitude were
-- removed on purpose in addendum 44).
-- Subjects and boards are lists of plain words, one entry per item.
-- Safe to run more than once.

alter table public.schools
  add column if not exists gcse_subjects text[] not null default '{}',
  add column if not exists a_level_subjects text[] not null default '{}',
  add column if not exists exam_boards text[] not null default '{}',
  add column if not exists inclusion_level text,
  add column if not exists inclusion_needs_supported text[] not null default '{}',
  add column if not exists inclusion_notes text;

alter table public.schools drop constraint if exists schools_inclusion_level_check;
alter table public.schools add constraint schools_inclusion_level_check
  check (inclusion_level is null or inclusion_level in ('none', 'limited', 'moderate', 'extensive'));

comment on column public.schools.inclusion_level is
  'How much SEN / inclusion support the school offers: none, limited, moderate, extensive. Null = not recorded. See addendum 160.';

notify pgrst, 'reload schema';
