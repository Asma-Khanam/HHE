-- Addendum 16 (2026-09-07) — CH-06 from Heather's "Questionnaire Change
-- Request v1.4": the questionnaire now suggests a year group from the
-- child's date of birth (British-curriculum 31 August cut-off). When a
-- parent picks a year group that doesn't match that suggestion, an optional
-- "why are you applying for this year group" box appears — this column is
-- where that text is stored. It's genuinely optional (never blocks Submit),
-- and only ever gets a value when the parent's choice disagrees with the
-- suggestion, so most rows will stay empty.

alter table public.children
  add column if not exists year_group_reason text;
