-- ============================================================================
-- Addendum 8 — 2026-09-07: drop the "Verified" document status
--
-- What this is for
-- ----------------
-- The document vault's review dropdown had four states: pending, received,
-- verified, chasing. In practice "verified" just meant "a founder clicked
-- the dropdown and picked it" — an extra manual step with no real
-- consequence anywhere else in the app (outstanding-documents counts only
-- ever checked whether a file existed, never its status). Removing it: a
-- document a family uploads now simply counts as done. 'chasing' and
-- 'pending' stay, for the real case of something actually being wrong or
-- still owed.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run this AFTER addendum 3 (it narrows the constraint
--   addendum 3 created).
-- ============================================================================

-- Any document a founder had manually marked "verified" now just counts as
-- received — nothing else in the app ever distinguished the two.
update public.documents set status = 'received' where status = 'verified';

alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('pending', 'received', 'chasing'));

comment on column public.documents.status is
  'pending = uploaded but nobody has looked; received = the family uploaded it and nothing is wrong with it (this is what their own app writes, and what a founder reverts to once an issue is resolved) — treated as "done", no separate verification step; chasing = a staff member has looked, something is wrong or missing, and the team is chasing the family for it. Re-uploading replaces the row, so a fresh file always starts at received.';
