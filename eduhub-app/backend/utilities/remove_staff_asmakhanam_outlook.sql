-- ============================================================================
-- Remove asmakhanam@outlook.in from the staff/admin system — 2026-09-07
--
-- What this does
-- --------------
-- Deletes that email's row from `public.staff`, so it no longer counts as
-- staff and loses access to every family in the founders app. It does NOT
-- delete their login (auth.users) — if that address ever signs in again,
-- it's just a normal signed-in-but-no-access account, same as before
-- anyone was added. If you also want the login itself gone, that's a
-- separate step in Supabase → Authentication → Users (delete the user
-- there) — not included here on purpose, since that's harder to undo.
--
-- This mirrors exactly what remove_staff_member() (addendum 13) does, run
-- directly as SQL instead of through the Team page — useful here since
-- removing yourself from the Team page while logged in as yourself can be
-- awkward. Same last-admin safety check is included below, so this will
-- refuse to run if asmakhanam@outlook.in is currently the only admin.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file →
--   Run. Safe to run once; running it again just does nothing (the row is
--   already gone).
-- ============================================================================

do $$
declare
  v_user_id uuid;
  v_role text;
  v_admin_count int;
begin
  select user_id, role into v_user_id, v_role
  from public.staff
  where lower(email) = lower('asmakhanam@outlook.in')
  limit 1;

  if v_user_id is null then
    raise notice 'asmakhanam@outlook.in is not in the staff table — nothing to remove.';
    return;
  end if;

  if v_role = 'admin' then
    select count(*) into v_admin_count from public.staff where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'asmakhanam@outlook.in is currently the only admin — make someone else admin first (Team page, or set_staff_role in SQL), then re-run this.';
    end if;
  end if;

  delete from public.staff where user_id = v_user_id;
  raise notice 'Removed asmakhanam@outlook.in from staff.';
end $$;
