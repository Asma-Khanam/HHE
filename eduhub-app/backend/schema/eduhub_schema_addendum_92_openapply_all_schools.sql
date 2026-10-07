-- Addendum 92 (7 Oct 2026): OpenApply sync for ALL schools and families.
--
-- Until now only Queen Elizabeth's was tagged as an OpenApply school, so only
-- Layla's application could ever sync. This:
--   1. Tags every school whose "apply now" link is an openapply.com address as
--      an OpenApply school, and fills in its portal login page
--      (<that school's openapply.com address>/dashboard) where it is empty.
--      Schools that already have a login link keep it.
--   2. Adds two columns on applications so the sync can say, per application,
--      whether the last check worked or why not (e.g. the family has no
--      account on that school's portal yet). Shown in the Applications tab.
-- Nothing is deleted. Safe to re-run.

update public.schools
set application_platform = 'openapply'
where application_url ilike '%.openapply.com%'
  and (application_platform is null or application_platform = '');

update public.schools
set openapply_login_url = substring(application_url from '^(https?://[^/]+)') || '/dashboard'
where application_url ilike '%.openapply.com%'
  and (openapply_login_url is null or openapply_login_url = '');

alter table public.applications
  add column if not exists openapply_sync_status text,
  add column if not exists openapply_sync_note text;

-- Which schools are now covered:
select name, application_platform, openapply_login_url
from public.schools
where application_platform = 'openapply'
order by name;

notify pgrst, 'reload schema';
