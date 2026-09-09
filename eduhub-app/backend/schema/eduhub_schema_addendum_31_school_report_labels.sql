-- ============================================================================
-- Addendum 31 — 2026-09-09: DU-04, labelling each school report
--
-- What this is for
-- ----------------
-- "Each school report upload has its own fields next to it for the term and
-- the date of the report... these labels should display alongside the file
-- in the admin area, so we can see at a glance which reports we hold."
--
-- Two new nullable columns on the existing polymorphic `documents` table —
-- not a new table, since this is metadata about one upload, not a new kind
-- of record. Only ever set for document_type = 'school_reports' in
-- practice, but left as plain columns on the whole table (like
-- original_filename or status) rather than restricted to one type, since
-- documents is already shared across every document type and owner.
--
--   report_term            text  — Autumn / Spring / Summer / Full year
--   report_academic_year   text  — e.g. "2025 to 2026"
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.documents
  add column if not exists report_term text,
  add column if not exists report_academic_year text;

comment on column public.documents.report_term is
  'DU-04 (September 2026 change request): which term a school_reports upload covers — Autumn / Spring / Summer / Full year. Set from the family''s own form, editable there too.';
comment on column public.documents.report_academic_year is
  'DU-04: which academic year a school_reports upload covers, e.g. "2025 to 2026".';

notify pgrst, 'reload schema';
