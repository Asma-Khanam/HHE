-- Addendum 23 (2026-09-09) — BUD-04 from Heather's "Questionnaire Change
-- Request v1.4": "Where are you thinking of living?" Family-level,
-- optional, free text — deliberately not a list of communities, since
-- families arriving from abroad rarely know area names yet.

alter table public.families
  add column if not exists preferred_living_area text;
