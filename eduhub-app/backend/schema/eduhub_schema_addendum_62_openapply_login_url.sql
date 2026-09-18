-- ============================================================================
-- Addendum 62 -- the actual OpenApply portal URL, separate from
-- schools.application_url (September 2026, Asma/Heather).
--
-- schools.application_url (addendum 41) is the public "apply here" link
-- staff click to START a new application -- e.g.
-- https://www.qedubaisportscity.com/apply-now/. Asma has now been given a
-- DIFFERENT link: https://qesdubaisportscity.openapply.com/dashboard --
-- the actual OpenApply portal a family logs into to check an application
-- ALREADY submitted. Same school, two different pages, two different jobs.
-- Overwriting application_url with this would have broken the existing
-- "Apply now" button on the School record and shortlist panel, so this adds
-- a second column instead, used only by the OpenApply sync job
-- (backend/openapply-sync/).
-- ============================================================================

alter table public.schools add column if not exists openapply_login_url text;

comment on column public.schools.openapply_login_url is
  'The OpenApply portal URL the sync job (backend/openapply-sync/) navigates to and logs into with the family''s application_alias/application_password -- NOT the public "apply now" link (that''s application_url, addendum 41). Only meaningful when application_platform = ''openapply'' (addendum 60/61).';

update public.schools
set openapply_login_url = 'https://qesdubaisportscity.openapply.com/dashboard'
where name ilike '%Queen Elizabeth%';

select id, name, application_platform, application_url, openapply_login_url
from public.schools
where application_platform = 'openapply';

notify pgrst, 'reload schema';
