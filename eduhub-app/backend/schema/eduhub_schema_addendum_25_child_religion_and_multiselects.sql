-- Addendum 25 (2026-09-09) — Section 4 (Child details) from Heather's
-- "Questionnaire Change Request v1.4":
--
-- CH-03: Religion, make "Other" selectable (Pattern A) — same idea as AH-03,
-- but children didn't have a religion field at all yet, so this is new.
--
-- CH-04/CH-05: Academic year of entry and Term both become "select all that
-- apply". These land on brand-new array columns (academic_years_of_entry,
-- terms) rather than changing the type of the existing
-- children.academic_year_of_entry / children.term columns — a type change
-- would need every existing saved value reinterpreted as an array, and
-- broken silently rather than loudly if it went wrong. The old columns are
-- left in place, untouched, for any historical record that only ever had a
-- single value.

alter table public.children
  add column if not exists religion text,
  add column if not exists academic_years_of_entry text[],
  add column if not exists terms text[];
