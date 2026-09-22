-- One-off data fix, 22 Sept 2026.
-- Deletes two client (family) accounts completely, so their login emails can
-- be used to sign up on the consultant site instead:
--   heather@heatherharries.com   family d269ec14-fbf4-46ec-965f-247dad34454b (Heather, Simon Harries)
--   relocate@heatherharries.com  family 571e64d1-1baa-471b-a716-fe76f8daafda (Michelle & Nicholas Phipps)
-- Run STEP 1 first and check it, then STEP 2. Cannot be undone.

-- ===================== STEP 1: check (changes nothing) =====================
select
  u.email                 as login_email,
  f.id                    as family_id,
  f.account_user_id       as login_user_id,
  (select string_agg(coalesce(p.full_name, '(no name)'), ', ') from public.parents p where p.family_id = f.id) as parents,
  (select count(*) from public.children c where c.family_id = f.id) as children,
  (select count(*) from public.applications a join public.children c on c.id = a.child_id where c.family_id = f.id) as applications,
  exists (select 1 from public.staff s where s.user_id = f.account_user_id) as is_also_staff
from public.families f
join auth.users u on u.id = f.account_user_id
where f.id in ('d269ec14-fbf4-46ec-965f-247dad34454b', '571e64d1-1baa-471b-a716-fe76f8daafda');
-- Expect exactly 2 rows, and is_also_staff = false on both.

-- ===================== STEP 2: delete =====================
begin;

create temp table _del on commit drop as
select f.id as family_id, f.account_user_id as user_id
from public.families f
where f.id in ('d269ec14-fbf4-46ec-965f-247dad34454b', '571e64d1-1baa-471b-a716-fe76f8daafda')
  -- safety: never delete a login that is also a staff login
  and not exists (select 1 from public.staff s where s.user_id = f.account_user_id);

-- 1. Document records. This table has no foreign key to cascade on, so
--    it's cleared by hand for everything that belonged to these families.
delete from public.documents d
where (d.owner_type = 'family' and d.owner_id in (select family_id from _del))
   or (d.owner_type = 'parent' and d.owner_id in (
        select p.id from public.parents p where p.family_id in (select family_id from _del)))
   or (d.owner_type = 'child' and d.owner_id in (
        select c.id from public.children c where c.family_id in (select family_id from _del)))
   or (d.owner_type = 'application' and d.owner_id in (
        select a.id from public.applications a
        join public.children c on c.id = a.child_id
        where c.family_id in (select family_id from _del)));

-- 2. "Who last changed this" pointers that don't clear themselves.
update public.record_audit_log set changed_by = null where changed_by in (select user_id from _del);
update public.app_settings set updated_by = null where updated_by in (select user_id from _del);
update public.application_portal_credentials set updated_by = null where updated_by in (select user_id from _del);

-- 3. Delete the two logins. The family rows and everything under them
--    (parents, children, schools, applications, fees, events, checklist,
--    shortlist, visits, notes, calendar, tasks, payments, stage history,
--    referrals, placements, portal logins) are removed automatically.
delete from auth.users where id in (select user_id from _del);

commit;

-- ===================== STEP 3: confirm =====================
select count(*) as families_left
from public.families
where id in ('d269ec14-fbf4-46ec-965f-247dad34454b', '571e64d1-1baa-471b-a716-fe76f8daafda');
-- Expect 0.
select email from auth.users where email in ('heather@heatherharries.com', 'relocate@heatherharries.com');
-- Expect no rows.
