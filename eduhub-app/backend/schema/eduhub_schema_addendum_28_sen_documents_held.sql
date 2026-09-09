-- ============================================================================
-- Addendum 28 — 2026-09-09: SEN-02, "Do you have any of the following
-- documents?"
--
-- What this is for
-- ----------------
-- One more "select all that apply" column for the SEN and inclusion
-- section, separate from addendum 27's four SEN-01 columns and given its
-- own addendum on purpose: SEN-02 is asked of every child regardless of
-- their SEN-01 answer, so it can go live independently.
--
--   sen_documents_held  text[]  — which of a fixed list of documents (an
--                                 educational psychologist report, an EHCP,
--                                 a UAE People of Determination card, and so
--                                 on) the family already has, or
--                                 ["None of the above"] if none.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.children
  add column if not exists sen_documents_held text[];

comment on column public.children.sen_documents_held is
  'SEN-02 (September 2026 change request): "Do you have any of the following documents?" — select all that apply, or ["None of the above"]. Asked regardless of the sen_status answer.';

notify pgrst, 'reload schema';
