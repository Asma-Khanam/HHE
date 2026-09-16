-- ============================================================================
-- Addendum 51 — 2026-09-16: family's post-tour decision on school_shortlist
--
-- What this is for
-- ----------------
-- The tour → application handoff (a "Family wants to proceed" button on a
-- completed tour that creates a draft application) only covers the "yes"
-- path. Just as real is the family touring a school and deciding NOT to
-- apply there -- until now there was nowhere to record that, so it looked
-- identical to "nobody's followed up yet" and staff had no way to tell the
-- two apart at a glance. This adds a small decision field on the tour
-- itself, separate from the applications table's own status (which only
-- exists once an application has actually been started, and covers the
-- school's decision -- offer/rejected -- not the family's).
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.school_shortlist add column if not exists family_decision text
  check (family_decision in ('proceeding', 'declined'));
alter table public.school_shortlist add column if not exists family_decision_note text;
alter table public.school_shortlist add column if not exists family_decision_at timestamptz;

comment on column public.school_shortlist.family_decision is
  'Set once the family has made up their mind after a completed tour. "proceeding" is set automatically when staff click through to start an application; "declined" is set by staff when the family says they don''t want to apply there. Null means no decision yet (the normal state right after a tour).';
comment on column public.school_shortlist.family_decision_note is
  'Optional free-text reason, mainly for a decline (e.g. "too far from home", "went with Repton instead").';

notify pgrst, 'reload schema';
