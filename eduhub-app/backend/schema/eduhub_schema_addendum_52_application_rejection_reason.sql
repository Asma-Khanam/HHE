-- ============================================================================
-- Addendum 52 — 2026-09-16: why an application was rejected
--
-- What this is for
-- ----------------
-- The applications table already has a "rejected" status, but nowhere to
-- say why -- "no space this year" and "didn't meet entry requirements" look
-- identical today. This adds one free-text reason column, captured right
-- when staff set an application to Rejected (a handful of common reasons
-- are suggested client-side, but this stays plain text rather than a fixed
-- enum, since schools reject for all sorts of reasons).
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.applications add column if not exists rejected_reason text;

comment on column public.applications.rejected_reason is
  'Free-text reason the school gave (or staff inferred) for a "rejected" application -- e.g. "No space this year", "Fees too high". Only meaningful once status = rejected; not cleared automatically if the status later changes back.';

notify pgrst, 'reload schema';
