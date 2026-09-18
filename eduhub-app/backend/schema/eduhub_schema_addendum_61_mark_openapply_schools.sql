-- ============================================================================
-- Addendum 61 -- tag which schools run on OpenApply (September 2026,
-- Asma/Heather), so the OpenApply sync job (backend/openapply-sync/) knows
-- which schools to even attempt logging into. schools.application_platform
-- was added by addendum 60; this just sets its value for the schools that
-- actually use it.
--
-- EDIT THE NAME BELOW before running -- 'Queen Elizabeth' is a guess at how
-- it's spelled in your schools table. Add one more `update` block per extra
-- OpenApply school (Heather said "almost 75%" of schools use it).
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run.
-- ============================================================================

update public.schools
set application_platform = 'openapply'
where name ilike '%Queen Elizabeth%';

-- Check it took:
select id, name, application_platform, application_url from public.schools
where application_platform = 'openapply';
