-- ============================================================================
-- Addendum 54 — 2026-09-16: primary choice vs backup option on a shortlist
--
-- What this is for
-- ----------------
-- Founders' request: some way to flag which shortlisted school is the
-- family's actual top choice versus which ones are just backups, so staff
-- (and the family, eventually) can tell "we're touring six schools" apart
-- from "but really we want this one." A plain text flag on the shortlist
-- row itself -- "primary" or "secondary" -- null until staff set it.
--
-- Only one school is meant to read as "primary" at a time, per family, but
-- that's enforced in the app (setting a new primary clears the old one)
-- rather than as a database constraint, same as every other manual flag on
-- this table (family_decision, tour_status, etc.).
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.school_shortlist add column if not exists priority text
  check (priority in ('primary', 'secondary'));

comment on column public.school_shortlist.priority is
  'Family''s stated ranking for this school: "primary" (top choice) or "secondary" (backup). Null means not ranked yet. The app keeps at most one "primary" per family by clearing any previous one when a new school is marked primary -- not enforced at the database level.';

notify pgrst, 'reload schema';
