-- ============================================================================
-- Addendum 15 — 2026-09-07: fix Pending signups showing every client too
--
-- What went wrong
-- ----------------
-- The founders app and the client app share the exact same Supabase Auth
-- project. A family creating their own login on the client site lands in
-- the same auth.users table as someone signing up on the founders Sign Up
-- page — nothing told them apart. So list_pending_signups() (addendum 14)
-- was showing every family who's ever signed up on the client side too,
-- not just people trying to join the team.
--
-- The fix
-- --------
-- The founders Sign Up page now tags its signups with
-- user_metadata.signup_source = "founders" (frontend change, already
-- shipped alongside this file). This addendum updates list_pending_signups
-- to only show logins carrying that tag — so a family's own account never
-- shows up on the Team page, no matter how many of them sign up.
--
-- Note: this only fixes signups from now on. Anyone who already appeared
-- in Pending signups before this ran (almost certainly client families,
-- based on what showed up) will simply disappear from the list after this
-- runs — that's correct, none of them should have been there. Nobody's
-- staff access changes; nothing was ever granted to them.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file →
--   Run. Safe to re-run. Run addendum 14 first.
-- ============================================================================

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
    and u.raw_user_meta_data ->> 'signup_source' = 'founders'
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

notify pgrst, 'reload schema';
