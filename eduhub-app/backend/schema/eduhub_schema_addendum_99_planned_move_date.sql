-- Addendum 99 (10 Oct 2026): when the family is MOVING to Dubai, not when
-- they are visiting it.
--
-- Heather (WhatsApp, 9 Oct 2026): the admissions enquiry email was pulling
-- the Dubai Available From date (addendum 53), which is the family's VISIT
-- window for tours and interviews, not when they actually move. This adds
-- a separate planned move date so staff and the templates can read the
-- right field.
--
-- Set by the family on their own Your move card (above the visit dates),
-- editable by staff on the Case bar. Null until it is filled in. Nothing
-- about addendum 53 changes.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Safe to re-run.

alter table public.families add column if not exists planned_move_date date;

comment on column public.families.planned_move_date is
  'When the family plans to move to Dubai (not the visit window — that is dubai_available_from/until). Set by the family on their own dashboard, editable by staff on the Case bar. Null until they fill it in.';

notify pgrst, 'reload schema';
