-- ============================================================================
-- Addendum 57 -- a fees link on the school record (September 2026, Heather
-- via WhatsApp): "Can we add a section in the schools for a link to school
-- fees?"
--
-- Deliberately a URL, not a number: schools' website_url addendum (41)
-- already has separate columns for application_fee and deposit_amount, but
-- a single figure can't represent fees that vary by year group -- exactly
-- the gap that came up separately when Heather asked about an
-- auto-generated document needing per-year-group fees. A link to the
-- school's own fee schedule page is honest about that instead of forcing a
-- single wrong-for-most-year-groups number into the record.
-- ============================================================================

alter table public.schools add column if not exists fees_url text;
comment on column public.schools.fees_url is 'Link to the school''s own fee schedule page (added Sept 2026, addendum 57).';

notify pgrst, 'reload schema';
