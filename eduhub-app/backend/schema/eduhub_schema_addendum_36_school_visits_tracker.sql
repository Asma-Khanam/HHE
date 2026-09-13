-- ============================================================================
-- Addendum 36 — the School visits tracker, Phase 1 (September 2026 change
-- request). Heather's own brief laid out a build order:
--
--   First: school record, shortlist table, availability replies, stage
--   timestamps. This alone retires the spreadsheet.
--   Then: tours, arrival details, clash check, feedback.
--   Then: the family timetable and its notifications.
--   Last: applications, offers and the conversion figures on the school
--   record.
--
-- This addendum is that first phase only. Tours/feedback, the family-facing
-- timetable, and the chase-clock/clash-check automation are deliberately
-- not built yet — they need real scheduling logic (drive-time lookups, a
-- background job to raise chase tasks) that's its own follow-up, not
-- something to bolt on half-finished alongside the record-keeping this
-- addendum is actually for.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The school record itself — schools already existed (a bare name +
-- location, added for the Applications panel), extended here with what a
-- school record is actually meant to hold: contact details, useful links,
-- and what its admissions process asks for.
-- ----------------------------------------------------------------------------

alter table public.schools
  add column if not exists area text,
  add column if not exists address text,
  add column if not exists curriculum text,
  add column if not exists admissions_contact_name text,
  add column if not exists admissions_contact_email text,
  add column if not exists admissions_contact_phone text,
  add column if not exists tour_booking_url text,
  add column if not exists application_url text,
  add column if not exists requires_cat4 boolean not null default false,
  add column if not exists requires_map boolean not null default false,
  add column if not exists requires_interview boolean not null default false,
  add column if not exists requires_taster_day boolean not null default false,
  add column if not exists application_fee numeric,
  add column if not exists deposit_amount numeric,
  add column if not exists documents_required text;

comment on column public.schools.documents_required is
  'Free text — whatever this school asks families to submit with an application. Not a closed list: every school''s paperwork differs enough that a fixed set of checkboxes would just be wrong for most of them.';

-- ----------------------------------------------------------------------------
-- 2. Year group availability — one row per school per year group. Kept as
-- its own table rather than columns on schools, since which year groups
-- even apply varies school to school and this needs to grow without a
-- migration every time.
-- ----------------------------------------------------------------------------

create table if not exists public.school_year_group_availability (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  year_group text not null,
  status text not null default 'open' check (status in ('open', 'waitlist', 'full')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, year_group)
);

-- ----------------------------------------------------------------------------
-- 3. The shortlist — one row per family per school they're considering.
-- `availability_status` is the family-level reply from the school (per
-- Heather's spec this is "answered per child" for WHICH year groups have
-- room — that nuance lives in school_year_group_availability above, which
-- already covers "some year groups" without needing it repeated per child
-- here too). Timestamps are explicit columns, not a generic log, so "days
-- since brief" and "days to reply" come out of a plain date subtraction
-- rather than a join over a history table.
-- ----------------------------------------------------------------------------

create table if not exists public.school_shortlist (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  shortlisted_at timestamptz not null default now(),
  availability_status text not null default 'awaiting'
    check (availability_status in ('awaiting', 'yes', 'no', 'waitlist', 'some_year_groups')),
  availability_replied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (family_id, school_id)
);

create index if not exists idx_school_shortlist_family on public.school_shortlist(family_id);
create index if not exists idx_school_shortlist_school on public.school_shortlist(school_id);

-- Stamps availability_replied_at the moment availability_status leaves
-- 'awaiting' for the first time — same "timestamp on entering a state"
-- idea as the rest of the brief, done once here rather than every screen
-- that updates this row having to remember to also set the timestamp.
create or replace function public.school_shortlist_stamp_reply()
returns trigger
language plpgsql
as $$
begin
  if new.availability_status is distinct from old.availability_status
     and new.availability_status <> 'awaiting'
     and new.availability_replied_at is null then
    new.availability_replied_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists school_shortlist_stamp_reply_trg on public.school_shortlist;
create trigger school_shortlist_stamp_reply_trg
  before update on public.school_shortlist
  for each row execute function public.school_shortlist_stamp_reply();

-- ----------------------------------------------------------------------------
-- 4. RLS — staff-only for now (public.is_staff() only; no family read
-- policy exists here yet). The family-facing timetable is Phase 3 of the
-- brief above and needs its own careful design, not a bare read grant on
-- this table bolted on early.
-- ----------------------------------------------------------------------------

alter table public.school_year_group_availability enable row level security;
drop policy if exists "staff_all_school_year_group_availability" on public.school_year_group_availability;
create policy "staff_all_school_year_group_availability" on public.school_year_group_availability
  for all
  using (public.is_staff())
  with check (public.is_staff());

alter table public.school_shortlist enable row level security;
drop policy if exists "staff_all_school_shortlist" on public.school_shortlist;
create policy "staff_all_school_shortlist" on public.school_shortlist
  for all
  using (public.is_staff())
  with check (public.is_staff());

notify pgrst, 'reload schema';
