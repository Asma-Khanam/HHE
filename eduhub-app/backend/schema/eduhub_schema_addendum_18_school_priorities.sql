-- Addendum 18 (2026-09-09) — AH-09 from Heather's "Questionnaire Change
-- Request v1.4": "What matters most to you in a school? Please rank your
-- top five." Family-level (not tied to one child or parent), saved as an
-- ordered array — position 1 in the array is the family's first priority.
-- text[] preserves the order Postgres receives it in, so no separate rank
-- column is needed.

alter table public.families
  add column if not exists school_priorities text[];
