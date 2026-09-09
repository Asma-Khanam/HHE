-- ============================================================================
-- Addendum 2 — 2026-09-01: staff/founders read access
--
-- Adds a `staff` table and new, ADDITIVE row-level-security policies that
-- let anyone listed in it read every family's data — on top of, not instead
-- of, the existing family-owner policies. Postgres OR's multiple permissive
-- policies together for the same command, so families keep exactly the same
-- access they've always had; this only opens a second door, for staff.
--
-- READ-ONLY, ON PURPOSE: staff can SELECT everything below, but nothing
-- here lets them INSERT/UPDATE/DELETE a family's data. That matches what's
-- actually being built right now (a dashboard so the team can see what's
-- going on) — a later addendum can widen this once there's a real editing
-- feature (leaving a note, marking a document verified, etc) that needs it.
--
-- WHO GETS STAFF ACCESS: nobody, automatically. Signing up through the new
-- founders app (eduhub-app/founders/) only creates a normal login — an
-- auth.users row, same as any family signing up creates. Being staff means
-- having a row in the `staff` table below, and there is deliberately NO
-- policy that lets a signed-in user add themselves to it — someone has to
-- insert that row by hand, from the Supabase dashboard, after the login
-- already exists. See the very bottom of this file for the exact insert to
-- run once IT@Heatherharries.com has signed up through the founders app.
-- ============================================================================

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.staff is
  'Who counts as Heather Harries staff, for row-level-security purposes. A row here is what grants cross-family read access — nothing else does. Added by hand (Supabase Table Editor, or the insert at the bottom of this file), never by the app itself.';

alter table public.staff enable row level security;

drop policy if exists "staff_read_self" on public.staff;
create policy "staff_read_self" on public.staff
  for select
  using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy on `staff` at all — the table
-- can only be changed from the Supabase dashboard (or anything else using
-- the service_role key), never by a signed-in app user, staff or not. This
-- is what keeps "sign up through the founders app" from being able to grant
-- itself access.

-- `security definer` so this can check the staff table even though the
-- policy above only lets someone see THEIR OWN row — the function runs
-- with the table owner's privileges, bypassing RLS just for this one
-- check, same pattern user_owns_document() already uses in eduhub_schema.sql.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- One additive read policy per table — every existing policy (the family-
-- owner ones from eduhub_schema.sql) is untouched, this just adds a second
-- way in, for staff only.
drop policy if exists "staff_read_families" on public.families;
create policy "staff_read_families" on public.families
  for select using (public.is_staff());

drop policy if exists "staff_read_parents" on public.parents;
create policy "staff_read_parents" on public.parents
  for select using (public.is_staff());

drop policy if exists "staff_read_children" on public.children;
create policy "staff_read_children" on public.children
  for select using (public.is_staff());

drop policy if exists "staff_read_current_schools" on public.current_schools;
create policy "staff_read_current_schools" on public.current_schools
  for select using (public.is_staff());

drop policy if exists "staff_read_applications" on public.applications;
create policy "staff_read_applications" on public.applications
  for select using (public.is_staff());

drop policy if exists "staff_read_documents" on public.documents;
create policy "staff_read_documents" on public.documents
  for select using (public.is_staff());

-- Storage: staff can VIEW/download a family's uploaded files (needed for
-- the founders app's Document Vault panel), but not overwrite or delete
-- them — that stays exclusive to the family itself, via the existing
-- per-user-folder policy in setup_documents_storage.sql.
drop policy if exists "staff_read_documents_bucket" on storage.objects;
create policy "staff_read_documents_bucket"
on storage.objects
for select
using (bucket_id = 'documents' and public.is_staff());

-- Force PostgREST to notice the new table/policies right away, same as
-- every previous addendum.
notify pgrst, 'reload schema';

-- ============================================================================
-- LAST STEP — DO THIS AFTER RUNNING EVERYTHING ABOVE, NOT BEFORE:
--
-- 1. Go to the founders app (once it's running — see the chat for how to
--    start it) and sign up with IT@Heatherharries.com. This creates the
--    login, same as any family sign-up would — it does NOT grant staff
--    access by itself.
-- 2. Confirm the email if Supabase asks for one, same as any family sign-up.
-- 3. Come back here and run this (delete the leading "-- " on each line
--    first, or just select these 3 lines and Run):
--
-- insert into public.staff (user_id, email, full_name)
-- select id, email, 'Heather Harries Team'
-- from auth.users where email = 'IT@Heatherharries.com';
--
-- That insert is what actually turns that login into a staff login — log
-- out and back in on the founders app afterwards and the families should
-- be there. Repeat step 3 (with a different email/name) for anyone else
-- who should get access later; they each need to sign up once first, same
-- as this one did.
-- ============================================================================
