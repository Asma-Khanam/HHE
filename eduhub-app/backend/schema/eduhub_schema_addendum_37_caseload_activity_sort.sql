-- ============================================================================
-- Addendum 37 — September 2026 change request: "every time I open a
-- caseload [family] or edit something in it, that should go up [the
-- Caseload list] — the ones not very active should go down."
--
-- Adds one timestamp column, stamped by the founders app whenever staff
-- open a family's record or save a change to it, and sorts the Caseload
-- list by it (most recently touched first). A family nobody's opened yet
-- has a null here and sorts to the very bottom, alongside the least
-- recently touched ones — exactly the "goes down" half of the request.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file →
--   Run. Safe to re-run.
-- ============================================================================

alter table public.families add column if not exists last_staff_activity_at timestamptz;

comment on column public.families.last_staff_activity_at is
  'Stamped by the founders app whenever staff open this family''s record or save a change to it (record fields, documents, case settings). Drives the Caseload list''s default sort — most recently touched first, never-touched families sort last. Not bumped by every possible sub-panel yet (tasks/payments/notes/applications/shortlist) — see FamilyDetailPage.jsx for exactly which actions touch it.';

-- Descending-with-nulls-last is the exact order the Caseload list wants, so
-- the index is built to match it precisely rather than a plain btree.
create index if not exists idx_families_last_staff_activity
  on public.families (last_staff_activity_at desc nulls last);

-- Staff already have UPDATE on families (case settings, application email —
-- see earlier addendums), so no RLS change is needed for staff to stamp
-- this column themselves.
