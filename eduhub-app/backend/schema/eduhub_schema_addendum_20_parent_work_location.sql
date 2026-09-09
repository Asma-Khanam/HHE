-- Addendum 20 (2026-09-09) — AH-11 from Heather's "Questionnaire Change
-- Request v1.4": "If one or both parents will be working, where will they
-- be based?" Family-level, optional, open text — one answer covers either
-- or both working parents, so it isn't split per-parent.

alter table public.families
  add column if not exists parent_work_location text;
