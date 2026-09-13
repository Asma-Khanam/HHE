-- ============================================================================
-- Addendum 34 — stop one email being used for both a client login and a
-- staff login (September 2026 change request): "please have a separate
-- section for founders logins and a separate one for clients, so this type
-- of overlap doesn't happen."
--
-- Both apps deliberately share one Supabase Auth project (see addendum 2's
-- comments) — that's what lets a staff admin actually read a family's data,
-- and splitting it into two separate auth systems would mean staff could no
-- longer read family data directly at all, needing a whole backend API in
-- between instead. That's a real migration, not something to do casually on
-- a live app with real family data in it.
--
-- What's actually needed here is smaller: nothing currently stops the exact
-- same email being used to sign up on both sides, which is what caused the
-- confusion this addendum is fixing. These two functions let each app's
-- SignUp page check, before creating a login, whether that email is already
-- the OTHER kind of account — and refuse with a clear reason if so. A
-- brand-new email is unaffected either way.
--
-- Both are security definer because an anonymous visitor (mid-signup, not
-- logged in yet) has no read access to auth.users, staff, or other
-- families' parents rows at all — that's the whole point of this project's
-- RLS. Each function only ever returns a plain true/false, never any actual
-- account data, so this can't be used to browse who's registered.
-- ============================================================================

create or replace function public.email_is_staff_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff s
    join auth.users u on u.id = s.user_id
    where lower(u.email) = lower(p_email)
  );
$$;

create or replace function public.email_is_client_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parents p where lower(p.email) = lower(p_email)
  )
  or exists (
    select 1
    from public.families f
    join auth.users u on u.id = f.account_user_id
    where lower(u.email) = lower(p_email)
  );
$$;

grant execute on function public.email_is_staff_account(text) to anon, authenticated;
grant execute on function public.email_is_client_account(text) to anon, authenticated;

notify pgrst, 'reload schema';
