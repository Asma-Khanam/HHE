-- ============================================================================
-- Grant one login access to the founders' portal
--
-- Run this in: Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- WHEN YOU NEED THIS: someone signs up on the founders app and gets
-- "You're signed in, but not set up yet". That message is correct behaviour,
-- not a bug — signing up only creates a login. Access to the family records
-- needs a row in public.staff, and there is deliberately NO policy that lets
-- the app create one. That is the entire thing stopping a stranger who finds
-- the URL from signing up and reading every family's passport scans. It has
-- to be done here, by hand, on purpose.
--
-- THE GOTCHA THAT ALREADY BIT US ONCE: Supabase stores emails in auth.users
-- LOWERCASED. Matching with `where email = 'IT@Heatherharries.com'` finds
-- nothing and inserts zero rows — and an INSERT that writes nothing still
-- reports "Success. No rows returned", which looks exactly like it worked.
-- Hence `ilike` below, and hence step 3, which is the only real confirmation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — check the login actually exists.
-- Expect one row. No rows means they haven't signed up on the founders app
-- yet, or signed up with a different address: fix that before going on.
-- ----------------------------------------------------------------------------
select id, email, created_at, email_confirmed_at
from auth.users
where email ilike 'IT@Heatherharries.com';

-- ----------------------------------------------------------------------------
-- STEP 2 — grant access.
-- Safe to re-run: on conflict does nothing if they're already staff.
-- ----------------------------------------------------------------------------
insert into public.staff (user_id, email, full_name)
select id, email, 'Heather Harries Team'
from auth.users
where email ilike 'IT@Heatherharries.com'
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- STEP 3 — confirm it worked. THIS is the check that counts.
-- Expect to see the row here. If this comes back empty, step 2 matched
-- nothing and nothing was written, whatever the editor said.
-- ----------------------------------------------------------------------------
select * from public.staff;

-- ----------------------------------------------------------------------------
-- Afterwards: log out and back in on the founders app, or just refresh — the
-- staff check runs on load, so a session that was already open still thinks
-- it has no access until it re-checks.
--
-- FOR ANYONE ELSE LATER: they sign up on the founders app first, then change
-- the email and the name in steps 1-3 and run it again.
--
-- TO REVOKE ACCESS: delete their row. The login still exists, it just stops
-- seeing any family data.
--   delete from public.staff where email ilike 'someone@example.com';
-- ============================================================================
