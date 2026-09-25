-- ============================================================================
-- Addendum 79 — 2026-09-25: "School Tour Details" card for parents
--
-- Founders' template (Heather, 25 Sept):
--   School / Date / Time / Arrival (arrive 10 minutes early) / Entrance-Gate /
--   Parking / Location (Google Maps link) / Who to ask for: Contact + On
--   arrival / What to bring (Passport/Emirates ID)
--
-- Gate, building, parking, ask-for and bring already exist on
-- school_shortlist (per tour) and schools (default_tour_*). This adds the
-- three that were missing: a Maps link, the "on arrival" instruction and an
-- arrival note -- per tour, plus a school-level default for each so the
-- consultant only types a school's details once.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ============================================================================

alter table public.school_shortlist add column if not exists tour_maps_url text;
alter table public.school_shortlist add column if not exists tour_on_arrival text;
alter table public.school_shortlist add column if not exists tour_arrival_note text;

alter table public.schools add column if not exists default_tour_maps_url text;
alter table public.schools add column if not exists default_tour_on_arrival text;

notify pgrst, 'reload schema';
