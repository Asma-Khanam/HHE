-- ============================================================================
-- Addendum 14 — 2026-09-07: pending signups + job positions
--
-- What this is for
-- -----------------
-- Addendum 13's add_staff_member() only works if you already know the exact
-- email someone signed up with, typed by hand — clunky in practice, and
-- easy to get wrong. This addendum adds:
--
--   1. list_pending_signups() — shows every login that's been created on
--      the Sign Up page but hasn't been granted staff access yet (email,
--      name if they gave one, when they signed up). Admin-only, same as
--      everything else here. The Team page now shows this as "Pending
--      signups" so granting access is picking someone from a list, not
--      typing their email from memory.
--
--   2. a `position` column on staff — a free-text job title (Founder, COO,
--      Intern, Consultant, whatever) shown next to each person's name.
--      This is separate from `role` — role is what the app enforces
--      (admin can manage the team, member can't), position is just a label
--      for everyone to see who's who.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file →
--   Run. Safe to re-run. Run addendum 13 first — this builds on it.
-- ============================================================================

alter table public.staff add column if not exists position text;

comment on column public.staff.position is
  'Free-text job title shown on the Team page (e.g. Founder, COO, Intern). Cosmetic only — role is what actually controls access.';

-- ----------------------------------------------------------------------------
-- list_pending_signups — every auth.users row with no matching staff row.
-- auth.users isn't exposed over the API at all, so this is the only way to
-- see who's signed up and waiting; security definer is what lets it read
-- auth.users despite that. full_name comes from the signup form's optional
-- name field (stored in the login's own metadata at signup time) — it's
-- just what they typed, not verified against anything.
-- ----------------------------------------------------------------------------
create or replace function public.list_pending_signups()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.raw_user_meta_data ->> 'full_name', u.created_at
  from auth.users u
  where public.is_staff_admin()
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

-- add_staff_member gains an optional position, kept backward compatible
-- (existing calls that don't pass one still work, position just stays null).
create or replace function public.add_staff_member(
  p_email text,
  p_full_name text,
  p_role text default 'member',
  p_position text default null
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

  insert into public.staff (user_id, email, full_name, role, position)
  values (v_user_id, p_email, nullif(btrim(p_full_name), ''), p_role, nullif(btrim(p_position), ''))
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        email = excluded.email,
        position = excluded.position
  returning * into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- set_staff_position — edit someone's job title without touching their role
-- or removing them. No last-admin logic needed here, it's cosmetic.
-- ----------------------------------------------------------------------------
create or replace function public.set_staff_position(p_user_id uuid, p_position text)
returns public.staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.staff;
begin
  if not public.is_staff_admin() then
    raise exception 'Only a team admin can change someone''s position.';
  end if;

  update public.staff
  set position = nullif(btrim(p_position), '')
  where user_id = p_user_id
  returning * into v_result;

  if v_result is null then
    raise exception 'That person is not on the team.';
  end if;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';

