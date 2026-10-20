-- Addendum 118 — Test family flag
-- Lets staff mark a family as a throwaway/test record while the app is being
-- built, so real families stay untouched. Test families are hidden from the
-- Caseload by default (a "Show test" toggle reveals them) and are safe to
-- bulk-delete later. Nothing else in the app keys off this column.
alter table public.families
  add column if not exists is_test boolean not null default false;

comment on column public.families.is_test is
  'Staff-set: true marks a throwaway/test family. Hidden from the Caseload by default; safe to delete later.';
