-- Addendum 111 (16 Oct 2026): part 2 of 2 for addendum 110.
--
-- Run this ONLY after addendum 110 is run, the Client website change that
-- reads family_application_fees is pushed and live, and the Billing page has
-- been checked. It removes the family's direct read of application_fees, so
-- the school's fee can no longer be read through the database at all.
-- Staff access is a different policy and is not touched. Nothing is deleted.
-- Safe to re-run.

drop policy if exists "application_fees_family_read" on public.application_fees;

notify pgrst, 'reload schema';
