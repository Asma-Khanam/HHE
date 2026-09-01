-- ============================================================================
-- Addendum 3 — 2026-09-01: staff workflow
--
-- Everything the founders' portal needs to stop being read-only: document
-- verification, a real pipeline stage per family, school applications per
-- child, and a tasks list.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE / DROP-then-
--   CREATE. Run addendum 2 (staff access) first if you somehow haven't — this
--   file uses the `staff` table and the is_staff() function it created.
--
-- THE ONE THING TO UNDERSTAND HERE: addendum 2 gave staff READ access only,
-- on purpose. This file gives them WRITE access, which is a real widening.
-- It is kept as narrow as row-level security can express, and where RLS
-- can't express it (RLS is per-row, never per-column) a trigger does the
-- rest — see families_protect_account / documents_protect_file below. The
-- short version: staff can now manage the team's own working data (stages,
-- tasks, applications, document review state) but still cannot re-point a
-- family at a different login, or tamper with which file a document row
-- points at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. documents — verification state
--
-- `status` already existed ('pending' / 'received' / 'verified') but nothing
-- has ever set it past 'received' (which is what the family's own upload
-- writes). Adding 'chasing' for the case in the reference screenshots: the
-- team has looked, it's wrong or missing, and someone is chasing the family
-- for it. Expiry is a real thing for passports and Emirates IDs, so the vault
-- can flag one that's about to lapse before a school does.
-- ----------------------------------------------------------------------------
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('pending', 'received', 'verified', 'chasing'));

alter table public.documents add column if not exists expires_at date;
alter table public.documents add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.documents add column if not exists reviewed_at timestamptz;
alter table public.documents add column if not exists staff_note text;

comment on column public.documents.status is
  'pending = uploaded but nobody has looked; received = the family uploaded it (what their own app writes); verified = a staff member has checked it and it is good; chasing = checked and something is wrong/missing, staff are chasing the family. Re-uploading replaces the row, so a fresh file always starts at received and has to be re-verified — that is deliberate.';

-- ----------------------------------------------------------------------------
-- 2. families — the caseload columns
--
-- pipeline_stage is the founders' OWN view of where a family is, and is
-- deliberately separate from `intake_status` (draft/submitted), which is the
-- family's own progress through their form. A family can be 'submitted' on
-- their side and still sitting at 'enquiry' on the team's side.
-- ----------------------------------------------------------------------------
alter table public.families add column if not exists pipeline_stage text not null default 'enquiry'
  check (pipeline_stage in ('enquiry', 'profile', 'applied', 'assessed', 'offer', 'placed'));
alter table public.families add column if not exists destination text;
alter table public.families add column if not exists origin text;
alter table public.families add column if not exists membership_type text;
alter table public.families add column if not exists owner_staff_id uuid references public.staff(user_id) on delete set null;

comment on column public.families.pipeline_stage is
  'The team''s own six-step pipeline: enquiry -> profile -> applied -> assessed -> offer -> placed. Set by staff in the founders portal. Separate from intake_status, which is the family''s own form progress.';
comment on column public.families.owner_staff_id is
  'Which staff member is the lead for this family. Everyone in `staff` can still see every family — this drives the "Mine" filter and the owner column, it is not an access control.';

-- ----------------------------------------------------------------------------
-- 3. applications — how good a fit each school is
--
-- The applications and schools tables have existed since the original schema
-- and have never had a row in them. This adds the one column the reference
-- screenshots show that wasn't already there.
-- ----------------------------------------------------------------------------
alter table public.applications add column if not exists fit text
  check (fit in ('best_fit', 'stretch', 'safe'));

comment on column public.applications.fit is
  'Staff''s read on the school relative to the child: best_fit / stretch / safe. Optional — null just means nobody has judged it yet.';

-- ----------------------------------------------------------------------------
-- 4. tasks — the Today page
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  title text not null,
  due_date date,
  done_at timestamptz,
  assigned_to uuid references public.staff(user_id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_family on public.tasks(family_id);
create index if not exists idx_tasks_due on public.tasks(due_date);

comment on table public.tasks is
  'Staff to-dos, usually attached to a family. Purely internal — families have no read access to this table at all, no policy grants it.';

alter table public.tasks enable row level security;

drop policy if exists "tasks_staff_all" on public.tasks;
create policy "tasks_staff_all" on public.tasks
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 5. Staff write policies
--
-- Each of these sits alongside the family-owner policies from the original
-- schema — same as addendum 2's read policies, Postgres OR's them together,
-- so nothing a family could already do stops working.
-- ----------------------------------------------------------------------------

-- families: staff can edit the working columns (stage, destination, owner).
-- The protective trigger below is what stops this from also being "staff can
-- hand a family's records to a different login."
drop policy if exists "staff_update_families" on public.families;
create policy "staff_update_families" on public.families
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- documents: staff can set review state. Again, the trigger below is what
-- keeps this from meaning "staff can re-point a document row at a different
-- file in storage."
drop policy if exists "staff_update_documents" on public.documents;
create policy "staff_update_documents" on public.documents
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- applications: fully staff-managed. Families never touch this table from
-- their own app — it's the team's record of where each child has applied.
drop policy if exists "staff_write_applications" on public.applications;
create policy "staff_write_applications" on public.applications
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- schools: a shared catalog. Everyone signed in could already read it (the
-- original schools_read_all policy); this lets staff add to and correct it.
drop policy if exists "staff_write_schools" on public.schools;
create policy "staff_write_schools" on public.schools
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- staff: everyone on the team can see who else is on the team, so a family
-- can be assigned an owner by name. This is on top of addendum 2's
-- staff_read_self, which is what a NON-staff signed-in user still gets
-- (their own row, which doesn't exist, hence no access). Still no insert/
-- update/delete policy anywhere — adding a staff member is still a manual
-- SQL insert, exactly as before.
drop policy if exists "staff_read_team" on public.staff;
create policy "staff_read_team" on public.staff
  for select
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- 6. Protective triggers
--
-- RLS can say "which rows", never "which columns". These two triggers are the
-- column half of the rule, and they apply to EVERYONE (families included, who
-- never do either of these things anyway — their app only ever inserts and
-- deletes document rows, and never touches account_user_id).
-- ----------------------------------------------------------------------------

create or replace function public.families_protect_account()
returns trigger
language plpgsql
as $$
begin
  if new.account_user_id is distinct from old.account_user_id then
    raise exception 'families.account_user_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists families_protect_account_trg on public.families;
create trigger families_protect_account_trg
  before update on public.families
  for each row execute function public.families_protect_account();

create or replace function public.documents_protect_file()
returns trigger
language plpgsql
as $$
begin
  if new.file_url    is distinct from old.file_url
  or new.owner_type  is distinct from old.owner_type
  or new.owner_id    is distinct from old.owner_id
  or new.document_type is distinct from old.document_type then
    raise exception 'documents: file_url/owner_type/owner_id/document_type cannot be changed — delete the row and re-upload instead';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_protect_file_trg on public.documents;
create trigger documents_protect_file_trg
  before update on public.documents
  for each row execute function public.documents_protect_file();

-- ----------------------------------------------------------------------------
-- 7. Tell PostgREST about all of the above right away.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- NOTHING ELSE TO DO — unlike addendum 2, there is no manual step at the
-- bottom of this file. Run it and the founders portal's new pages work.
--
-- Optional, only if you want the "owner" column on the Caseload table to show
-- someone straight away rather than "Unassigned": you can also set an owner
-- from the portal itself, on any family's record page. This does the same
-- thing for every family at once, using the IT@Heatherharries.com staff row:
--
-- update public.families
-- set owner_staff_id = (select user_id from public.staff
--                       where email ilike 'IT@Heatherharries.com');
-- ============================================================================
