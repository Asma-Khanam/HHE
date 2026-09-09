-- Addendum 19 (2026-09-09) — AH-10 from Heather's "Questionnaire Change
-- Request v1.4": "What is your comfortable annual fee range, per child?"
-- Family-level (same shape as AH-09's school_priorities), single-select
-- from a fixed list of 8 options, so a plain text column is enough — no
-- array needed since only one answer is stored.

alter table public.families
  add column if not exists comfortable_fee_range text;
