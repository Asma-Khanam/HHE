-- ============================================================================
-- Addendum 13 — 2026-09-07: team management, without needing Supabase access
--
-- What this is for
-- ----------------
-- Up to now, the ONLY way to grant someone staff access was for whoever
-- manages the Supabase project to run an insert by hand (see the bottom of
-- eduhub_schema_addendum_2_staff.sql). That's fine for one person bootstrapping
-- the very first login, but it means the whole team is permanently dependent
-- on that one person to add or remove anyone else — a real problem if they
-- ever step away from the company.
--
-- This addendum adds a `role` to staff ('admin' | 'member') and two functions
-- (add_staff_member / remove_staff_member) that let an admin manage the team
-- from inside the founders app itself — no Supabase dashboard, no SQL, ever
-- again after this one file is run. Ordinary staff ('member') still can't
-- add or remove anyone; only 'admin' can, and the functions refuse to leave
-- the team with zero admins.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendums 2 and 3 first — this builds on the `staff`
--   table and is_staff() they created.
--
-- ONE LAST MANUAL STEP, after running this file: every row already in
-- `staff` gets bumped to role='admin' below (see the UPDATE statement) —
-- that's deliberate, so whoever's using the app today doesn't lock
-- themselves out. If that's not actually who you want holding admin (e.g.
-- the shared IT@heatherharries.com login), open the new Team page in the
-- founders app and adjust roles from there instead of touching SQL again.
-- ============================================================================

alter table public.staff add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

comment on column public.staff.role is
  '''admin'' can add, remove, and promote/demote team members from the founders app''s Team page. ''member'' is everyone else — full staff access to every family, same as before, just no team-management ability. Defaults to member so a new hire never accidentally gets admin.';

-- One-time bootstrap: everyone already in the table becomes admin, so
-- today's login(s) can start adding the rest of the team immediately after
-- this runs, with nobody locked out. This UPDATE only ever does anything
-- the first time this file is run — after that, roles are managed from the
-- Team page, and re-running this file is harmless (it just re-affirms
-- whoever is already an admin).
update public.staff set role = 'admin' where role = 'member';

-- Same pattern as is_staff() (addendum 2) — security definer so it can
-- check the staff table regardless of which row RLS would otherwise let
-- the caller see.
create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'admin');
$$;

-- Admins can edit or remove a team member's row directly (promote/demote,
-- fix a typo'd name). Adding someone new still goes through
-- add_staff_member() below, not a raw insert — that's what does the
-- "look up the login that already exists" work a plain insert can't.
drop policy if exists "staff_admin_update" on public.staff;
create policy "staff_admin_update" on public.staff
  for update
  using (public.is_staff_admin())
  with check (public.is_staff_admin());

drop policy if exists "staff_admin_delete" on public.staff;
create policy "staff_admin_delete" on public.staff
  for delete
  using (public.is_staff_admin());

-- ----------------------------------------------------------------------------
-- add_staff_member — what the Team page's "+ Add team member" form calls.
--
-- Takes an email, not a user_id, because that's all an admin actually knows
-- about the person they're adding — this function does the auth.users
-- lookup a plain client-side query can't (auth.users isn't exposed over the
-- API at all, by Supabase's own design). SECURITY DEFINER is what lets it
-- read auth.users despite that.
--
-- The person being added must already have a login (they signed up via the
-- founders app's own Sign Up page first) — this still can't invite someone
-- who doesn't exist yet, on purpose, same reasoning as addendum 2's original
-- two-step design: a login by itself proves nothing, a real person choosing
-- their own password does.
-- ----------------------------------------------------------------------------
create or replace function public.add_staff_member(
  p_email text,
  p_full_name text,
  p_role text default 'member'
)
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result public.staff;
begin
  if not public.is_staff_admin() then
    raise exception 'Only a team admin can add someone to the team.';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member.';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;

  if v_user_id is null then
    raise exception 'No login found for %. Ask them to sign up in the founders app first, then add them.', p_email;
  end if;

  insert into public.staff (user_id, email, full_name, role)
  values (v_user_id, p_email, nullif(btrim(p_full_name), ''), p_role)
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        email = excluded.email
  returning * into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- remove_staff_member — revokes access entirely (deletes the staff row; the
-- person's login itself still exists, they just go back to "signed in, no
-- access", same as before anyone added them).
--
-- Refuses to remove the last remaining admin, so the team can never end up
-- with nobody able to manage it. Demoting or removing yourself is otherwise
-- allowed — if you're not the last admin, someone else can still run things.
-- ----------------------------------------------------------------------------
create or replace function public.remove_staff_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_admin_count int;
begin
  if not public.is_staff_admin() then
    raise exception 'Only a team admin can remove someone from the team.';
  end if;

  select role into v_target_role from public.staff where user_id = p_user_id;
  if v_target_role is null then
    return; -- already gone, nothing to do
  end if;

  if v_target_role = 'admin' then
    select count(*) into v_admin_count from public.staff where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'Can''t remove the last admin — make someone else admin first.';
    end if;
  end if;

  delete from public.staff where user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- set_staff_role — promote or demote, without removing anyone. Same
-- last-admin protection as remove_staff_member.
-- ----------------------------------------------------------------------------
create or replace function public.set_staff_role(p_user_id uuid, p_role text)
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_role text;
  v_admin_count int;
  v_result public.staff;
begin
  if not public.is_staff_admin() then
    raise exception 'Only a team admin can change someone''s role.';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member.';
  end if;

  select role into v_current_role from public.staff where user_id = p_user_id;
  if v_current_role is null then
    raise exception 'That person is not on the team.';
  end if;

  if v_current_role = 'admin' and p_role = 'member' then
    select count(*) into v_admin_count from public.staff where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'Can''t remove the last admin — make someone else admin first.';
    end if;
  end if;

  update public.staff set role = p_role where user_id = p_user_id returning * into v_result;
  return v_result;
end;
$$;

notify pgrst, 'reload schema';
