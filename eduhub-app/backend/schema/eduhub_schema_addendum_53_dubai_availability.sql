-- ============================================================================
-- Addendum 53 — 2026-09-16: when the family will actually be in Dubai
--
-- What this is for
-- ----------------
-- The client dashboard's "Your move" card only asked where a family is
-- moving from and to -- nothing about when they'll physically be in Dubai,
-- which matters for booking school tours and interviews around their actual
-- travel dates. This adds a simple from/until date range, set once by the
-- family on their own dashboard (same "Your move" card, same pattern as
-- origin/destination), and read by staff on the family's Case bar.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.families add column if not exists dubai_available_from date;
alter table public.families add column if not exists dubai_available_until date;

comment on column public.families.dubai_available_from is
  'First date the family says they''ll be in Dubai -- set by the family on their own dashboard, editable by staff on the Case bar. Null until they fill it in.';
comment on column public.families.dubai_available_until is
  'Last date the family says they''ll be in Dubai. Null until they fill it in.';

notify pgrst, 'reload schema';
