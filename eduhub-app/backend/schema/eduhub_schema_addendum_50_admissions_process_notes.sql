-- ============================================================================
-- Addendum 50 — 2026-09-16: free-text admissions process notes on the
-- school record
--
-- What this is for
-- ----------------
-- Founders' meeting note: "No place to add admissions process." The School
-- record already shows an "Admissions process" summary, but it's entirely
-- computed from a handful of checkboxes (CAT4/MAP/Interview/Taster day) plus
-- the fee/deposit amounts -- there was never anywhere to type the school's
-- actual process in plain words (e.g. "Round 1 interview, then CAT4, offer
-- usually within 2 weeks"). This adds one nullable free-text column for
-- that, edited on the school's own record page (not per-family), same
-- place as the checkboxes it sits next to.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.schools add column if not exists admissions_process_notes text;

comment on column public.schools.admissions_process_notes is
  'Free-text description of this school''s actual admissions process (e.g. "Round 1 interview, then CAT4, then offer within 2 weeks"). Edited once on the school record. Separate from the requires_cat4/requires_map/requires_interview/requires_taster_day checkboxes, which only drive the short computed summary shown elsewhere.';

notify pgrst, 'reload schema';
