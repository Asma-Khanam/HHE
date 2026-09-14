-- ============================================================================
-- Addendum 38 — School Visits Tracker, Phase 2 & 3 (September 2026 change
-- request: "finish building the school thing entirely").
--
-- Phase 1 (addendum 36/37) shipped: the school record, the shortlist,
-- family-level availability replies, and stage timestamps. This addendum
-- adds the rest of Heather's own "Build note for IT", in her stated order:
--
--   Phase 2 — tours (with arrival details), a same-day clash check, and
--             feedback (text + rating).
--   Phase 3 — the family-facing timetable (families can now read their own
--             shortlist/tour rows) and the chase clock (an automated task
--             raised when a school hasn't replied to an availability
--             request in 3 working days, escalated at 5).
--
-- Two honest scope notes, so nothing here is quietly weaker than it looks:
--
--   1. Clash check: real drive-time needs a routing API (Google Maps
--      Distance Matrix or similar) and this project doesn't have one wired
--      up. What's built instead is a straight-line (haversine) distance
--      between the two schools' latitude/longitude, converted to an
--      estimated drive time at a flat 30 km/h assumption — a reasonable
--      stand-in for "is there obviously not enough time between these two
--      tours", not a real ETA. Swapping in a real routing API later is a
--      matter of replacing estimate_drive_minutes() below with an HTTP
--      call from application code; the schema doesn't need to change.
--   2. "The family is notified" (Phase 3): there's no email/SMS sending
--      set up anywhere in this project (the application-email feature is
--      inbound-only — see addendum 7). What's built is the family's own
--      timetable page showing tours live, which satisfies "appears on the
--      family's dashboard within a minute." An actual push/email/SMS nudge
--      when a tour time changes needs a notification service added to the
--      project first — flagging this rather than building a silent no-op.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file →
--   Run. Safe to re-run. Needs addendum 36 (schools/school_shortlist)
--   already applied.
--
--   The chase clock (section 5 below) additionally needs the pg_cron
--   extension enabled once: Database → Extensions → search "pg_cron" →
--   Enable. Then run the two `select cron.schedule(...)` lines at the very
--   bottom of this file (commented out — uncomment and run them after
--   pg_cron is enabled, in their own query).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-child availability answers.
--
-- Phase 1's school_shortlist.availability_status is one reply per FAMILY.
-- Heather's note is explicit that the reply is "answered per child" (a
-- school can have room for the Year 4 sibling and not the Year 7 one, per
-- the reference mockup's Layla/Omar columns) — this table is that, kept
-- separate from school_shortlist rather than replacing its family-level
-- column, since the family-level status/timestamp already shipped and
-- other screens (SchoolDetailPage's family list) read it as the overall
-- "where it's up to" for that school. Per-child answers refine that; they
-- don't replace it.
-- ----------------------------------------------------------------------------

create table if not exists public.school_shortlist_child_status (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.school_shortlist(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  availability_status text not null default 'awaiting'
    check (availability_status in ('awaiting', 'yes', 'no', 'waitlist', 'some_year_groups')),
  availability_replied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (shortlist_id, child_id)
);

create index if not exists idx_shortlist_child_status_shortlist on public.school_shortlist_child_status(shortlist_id);
create index if not exists idx_shortlist_child_status_child on public.school_shortlist_child_status(child_id);

create or replace function public.school_shortlist_child_status_stamp_reply()
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

drop trigger if exists school_shortlist_child_status_stamp_reply_trg on public.school_shortlist_child_status;
create trigger school_shortlist_child_status_stamp_reply_trg
  before update on public.school_shortlist_child_status
  for each row execute function public.school_shortlist_child_status_stamp_reply();

-- ----------------------------------------------------------------------------
-- 2. Tours and feedback — added directly to school_shortlist (one current
-- tour per family/school, matching the reference mockup's single "Tour"
-- column; not a history of every rebooking, which the mockup doesn't ask
-- for either). A timestamp is stamped automatically the moment tour_status
-- FIRST enters each state, same "timestamp on entering a state" pattern as
-- Phase 1's availability_replied_at — so "days since offered", "days to
-- confirm" etc. come out of a plain date subtraction later, without staff
-- having to remember to log anything.
-- ----------------------------------------------------------------------------

alter table public.school_shortlist add column if not exists tour_date date;
alter table public.school_shortlist add column if not exists tour_start_time time;
alter table public.school_shortlist add column if not exists tour_end_time time;
alter table public.school_shortlist add column if not exists tour_status text
  check (tour_status in ('offered', 'confirmed', 'completed', 'cancelled'));
alter table public.school_shortlist add column if not exists tour_gate text;
alter table public.school_shortlist add column if not exists tour_building text;
alter table public.school_shortlist add column if not exists tour_parking text;
alter table public.school_shortlist add column if not exists tour_ask_for text;
alter table public.school_shortlist add column if not exists tour_bring text;
alter table public.school_shortlist add column if not exists tour_offered_at timestamptz;
alter table public.school_shortlist add column if not exists tour_confirmed_at timestamptz;
alter table public.school_shortlist add column if not exists tour_completed_at timestamptz;
alter table public.school_shortlist add column if not exists tour_cancelled_at timestamptz;

alter table public.school_shortlist add column if not exists feedback_text text;
alter table public.school_shortlist add column if not exists feedback_rating smallint
  check (feedback_rating between 1 and 5);
-- Who most recently wrote/edited the feedback — the mockup says feedback can
-- be "by the family or by us"; families don't have write access on this
-- table yet (see section 4's note on that), so this is staff-only for now,
-- but the column exists so family-submitted feedback is a UI addition
-- later, not another migration.
alter table public.school_shortlist add column if not exists feedback_by text
  check (feedback_by in ('family', 'staff'));
alter table public.school_shortlist add column if not exists feedback_at timestamptz;

comment on column public.school_shortlist.tour_status is
  'offered = we proposed a time; confirmed = the school/family locked it in; completed = it happened; cancelled = it did not. Each transition''s *_at column below is stamped once, the first time tour_status enters that value.';

create or replace function public.school_shortlist_stamp_tour_status()
returns trigger
language plpgsql
as $$
begin
  if new.tour_status is distinct from old.tour_status then
    if new.tour_status = 'offered' and new.tour_offered_at is null then
      new.tour_offered_at := now();
    elsif new.tour_status = 'confirmed' and new.tour_confirmed_at is null then
      new.tour_confirmed_at := now();
    elsif new.tour_status = 'completed' and new.tour_completed_at is null then
      new.tour_completed_at := now();
    elsif new.tour_status = 'cancelled' and new.tour_cancelled_at is null then
      new.tour_cancelled_at := now();
    end if;
  end if;
  -- Feedback isn't a one-way state like tour_status — a family or a
  -- consultant can come back and revise it — so this just stamps "most
  -- recently written", every time the text or rating actually changes.
  if (new.feedback_text is distinct from old.feedback_text
      or new.feedback_rating is distinct from old.feedback_rating)
     and (new.feedback_text is not null or new.feedback_rating is not null) then
    new.feedback_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists school_shortlist_stamp_tour_status_trg on public.school_shortlist;
create trigger school_shortlist_stamp_tour_status_trg
  before update on public.school_shortlist
  for each row execute function public.school_shortlist_stamp_tour_status();

-- ----------------------------------------------------------------------------
-- 3. School coordinates, for the clash check's distance estimate. Optional/
-- staff-entered — a school with no coordinates on file simply can't be
-- clash-checked yet, rather than blocking anything.
-- ----------------------------------------------------------------------------

alter table public.schools add column if not exists latitude numeric;
alter table public.schools add column if not exists longitude numeric;

comment on column public.schools.latitude is
  'Optional. Only used for the same-day tour clash estimate (see school_shortlist_stamp_tour_status and estimate_drive_minutes) — leave null if unknown, that school just won''t be included in clash checks.';

-- Haversine straight-line distance in km between two lat/lng points, then a
-- flat 30 km/h assumption to turn that into minutes. This is deliberately
-- not a real routing calculation (no traffic, no roads) — see the file
-- header note. It's a same-day "is this obviously too tight" flag, not a
-- promised ETA.
create or replace function public.estimate_drive_minutes(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else (
      2 * 6371 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    ) / 30.0 * 60.0
  end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS.
--
-- school_shortlist_child_status: staff-only, same as its parent table.
--
-- school_shortlist itself gets a new family-facing SELECT-only policy —
-- Phase 3's family timetable needs to read tour date/time/gate/building/
-- feedback for their own family's rows. Deliberately SELECT only: families
-- can see their tours and feedback, but can't edit the shortlist row
-- itself from here (feedback_by='family' is a column for later, once a
-- family-facing feedback FORM exists — right now nothing writes it from
-- that side, so there's nothing to protect against yet, but read-only is
-- the safer default until that UI exists).
-- ----------------------------------------------------------------------------

alter table public.school_shortlist_child_status enable row level security;
drop policy if exists "staff_all_school_shortlist_child_status" on public.school_shortlist_child_status;
create policy "staff_all_school_shortlist_child_status" on public.school_shortlist_child_status
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "family_read_school_shortlist" on public.school_shortlist;
create policy "family_read_school_shortlist" on public.school_shortlist
  for select
  using (family_id in (select id from public.families where account_user_id = auth.uid()));

-- Families also need to read the school record itself (name, address,
-- admissions contact...) and, for the per-child hint, their own children's
-- shortlist-child-status rows. schools already has schools_read_all from
-- the original schema (every signed-in family can browse the catalog), so
-- only the child-status table needs a family read policy added.
drop policy if exists "family_read_school_shortlist_child_status" on public.school_shortlist_child_status;
create policy "family_read_school_shortlist_child_status" on public.school_shortlist_child_status
  for select
  using (
    child_id in (
      select c.id from public.children c
      join public.families f on f.id = c.family_id
      where f.account_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. The chase clock. "No reply to an availability email after 3 working
-- days raises a task, after 5 it escalates to the consultant."
--
-- chase_task_id / chase_escalated_at track what's already been raised so
-- re-running this daily never creates duplicate tasks, and so the UI (the
-- reference mockup's "5 days, escalate" in red) has something to show.
-- ----------------------------------------------------------------------------

alter table public.school_shortlist add column if not exists chase_task_id uuid references public.tasks(id) on delete set null;
alter table public.school_shortlist add column if not exists chase_escalated_at timestamptz;

-- Working days between two timestamps (Mon–Fri only; no public holiday
-- calendar — out of scope here, nothing in this project tracks UAE/UK
-- holidays yet). Counts whole days elapsed, not calendar days.
create or replace function public.working_days_between(p_from timestamptz, p_to timestamptz)
returns integer
language sql
stable
as $$
  select count(*)::int
  from generate_series(p_from::date + 1, p_to::date, interval '1 day') as d
  where extract(isodow from d) < 6;
$$;

-- Run daily (see the cron schedule at the bottom of this file). For every
-- shortlist row still 'awaiting' after 3 working days with no chase task
-- yet, raises one on the family's own owner_staff_id (unassigned if the
-- family has none). At 5 working days, stamps chase_escalated_at so the
-- UI can flag it — "escalate to the consultant" in this CRM just means the
-- family's own consultant (owner_staff_id) IS who the chase task already
-- went to; escalating raises a second, more urgent task rather than
-- silently reassigning the family to someone else.
create or replace function public.raise_school_shortlist_chase_tasks()
returns void
language plpgsql
as $$
declare
  r record;
  v_task_id uuid;
begin
  for r in
    select ss.id, ss.family_id, ss.school_id, ss.shortlisted_at, ss.chase_task_id, ss.chase_escalated_at,
           f.owner_staff_id, s.name as school_name, f.id as fid
    from public.school_shortlist ss
    join public.families f on f.id = ss.family_id
    join public.schools s on s.id = ss.school_id
    where ss.availability_status = 'awaiting'
  loop
    if r.chase_task_id is null and public.working_days_between(r.shortlisted_at, now()) >= 3 then
      insert into public.tasks (family_id, title, due_date, assigned_to)
      values (
        r.family_id,
        'Chase ' || r.school_name || ' for an availability reply',
        current_date,
        r.owner_staff_id
      )
      returning id into v_task_id;

      update public.school_shortlist set chase_task_id = v_task_id where id = r.id;
    end if;

    if r.chase_escalated_at is null and public.working_days_between(r.shortlisted_at, now()) >= 5 then
      insert into public.tasks (family_id, title, due_date, assigned_to)
      values (
        r.family_id,
        'ESCALATE — ' || r.school_name || ' still hasn''t replied on availability (5+ working days)',
        current_date,
        r.owner_staff_id
      );

      update public.school_shortlist set chase_escalated_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;

-- Nobody signed in through either app should call this directly — it's
-- meant to run on pg_cron's own schedule as the table owner, not be
-- reachable from anon/authenticated. Revoke explicitly rather than relying
-- on default privileges, same reasoning as log_application_email.
revoke execute on function public.raise_school_shortlist_chase_tasks() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- ONE-TIME SETUP (do this after everything above has run successfully):
--
--   1. Database → Extensions → enable "pg_cron".
--   2. Run this in its own query, once:
--
--        select cron.schedule(
--          'school-shortlist-chase-clock',
--          '0 6 * * *',  -- 06:00 UTC daily — adjust to whenever suits the team
--          $$select public.raise_school_shortlist_chase_tasks();$$
--        );
--
--   To stop it later: select cron.unschedule('school-shortlist-chase-clock');
-- ----------------------------------------------------------------------------
