-- ============================================================================
-- Addendum 10 — 2026-09-07: school visit dates
--
-- What this is for
-- ----------------
-- "School visits" and "visit date" were their own note in the founders'
-- meeting notes, separate from application deadlines. A visit belongs to one
-- child's application to one school, so it lives on the `applications` row
-- rather than a new table — one date field, plus somewhere to jot what
-- happened at the visit.
--
-- Visit dates show up on the shared calendar (addendum 6) the same way tasks
-- do: read alongside calendar_events and tasks, not copied into a duplicate
-- table. See the founders app's staffData.js loadCalendarEvents().
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run the original schema first — this uses `applications`.
-- ============================================================================

alter table public.applications add column if not exists visit_date date;
alter table public.applications add column if not exists visit_notes text;

comment on column public.applications.visit_date is
  'When the family/agent is visiting (or has visited) this school for this application, if scheduled. Shown on the shared calendar alongside tasks and calendar_events — not a separate calendar of its own.';
comment on column public.applications.visit_notes is
  'Free text about the visit — what was seen, who was met, impressions. Not the same as case_notes: this is specific to one application''s visit, not a general timeline entry.';
