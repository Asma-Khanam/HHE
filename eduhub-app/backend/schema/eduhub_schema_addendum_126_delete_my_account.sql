-- ============================================================================
-- Addendum 126 — 26 Oct 2026: a family can delete their own account (Apple 5.1.1(v))
--
-- Apple requires account deletion from inside the app. HHE keeps accounting
-- records (invoices / payments), so the family ROW can't be removed. Instead:
--
--   * the login (auth user) is deleted by the /api/delete-account function
--   * this function erases everything the family entered or uploaded:
--       documents rows, children, parents, home address, application
--       password and application email alias
--   * the family row stays, with no login, archived with the reason
--     "Account deleted by family", so invoices and payment records survive
--     and the founders can see it happened
--
-- families.account_user_id becomes optional, and deleting the login no longer
-- cascades to the family.
--
-- Safe to re-run. Needs addendum 125 (archive columns).
-- HOW TO RUN: Supabase -> SQL Editor -> paste this whole file -> Run.
-- ============================================================================

alter table public.families alter column account_user_id drop not null;

do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.families'::regclass
     and contype = 'f'
     and confrelid = 'auth.users'::regclass
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.families'::regclass and attname = 'account_user_id')];
  if c is not null then
    execute format('alter table public.families drop constraint %I', c);
  end if;
  alter table public.families
    add constraint families_account_user_id_fkey
    foreign key (account_user_id) references auth.users(id) on delete set null;
end $$;

-- Returns the storage folder (the user's id) so the caller can clear files.
create or replace function public.erase_family_data(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
begin
  select id into v_family from public.families where account_user_id = p_user;
  if v_family is null then
    raise exception 'No family found for this account.';
  end if;

  -- uploaded documents (rows; the API removes the files from storage)
  delete from public.documents d
   where (d.owner_type = 'parent' and d.owner_id in (select id from public.parents  where family_id = v_family))
      or (d.owner_type = 'child'  and d.owner_id in (select id from public.children where family_id = v_family))
      or (d.owner_type = 'application' and d.owner_id in (
            select a.id from public.applications a
             where a.child_id in (select id from public.children where family_id = v_family)));

  delete from public.children where family_id = v_family;
  delete from public.parents  where family_id = v_family;

  update public.families
     set home_address = null,
         application_password = null,
         application_alias = null,
         account_user_id = null,
         archived_at = coalesce(archived_at, now()),
         archived_reason = 'Account deleted by family'
   where id = v_family;

  return v_family;
end;
$$;
revoke execute on function public.erase_family_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_family_data(uuid) to service_role;

notify pgrst, 'reload schema';
