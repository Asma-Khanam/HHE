-- Addendum 72 -- the manual "needs attention" flag on an application (Sept
-- 2026 Applications-tab card/timeline redesign). Sits alongside the
-- automatic, time-based flag (computed in the app from application_events,
-- no schema needed for that half) so a consultant can flag or clear
-- "this one's stuck" by hand at any point, with an optional one-line note.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Safe to re-run.

alter table public.applications
  add column if not exists needs_attention boolean not null default false,
  add column if not exists needs_attention_note text;

notify pgrst, 'reload schema';
