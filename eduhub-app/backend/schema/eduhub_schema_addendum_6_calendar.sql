-- ============================================================================
-- Addendum 6 — 2026-09-06: shared calendar
--
-- What this is for
-- ----------------
-- One calendar for deadlines, consultant reminders/follow-ups, and general
-- team events — scheduled by founders, filterable by consultant, and
-- optionally shown to the family it belongs to.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement is IF NOT EXISTS / DROP-then-CREATE.
--   Run addendums 2 and 3 first — this file uses the `staff` table and the
--   is_staff() function they created.
--
-- THE ONE THING TO UNDERSTAND HERE: this is NOT another `tasks` or
-- `case_notes` table with a column added on. Those two are internal by
-- design, on purpose, with no policy that grants a family anything — see
-- their own files for why. A calendar event is different: a founder decides,
-- per event, whether the family sees it too. `visible_to_client` defaults to
-- false, so nothing becomes visible by accident, and turning it on is a
-- deliberate action taken on one event at a time, never a table-wide switch.
-- ============================================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),

  -- Null family_id = a general team event, not tied to any one family (e.g.
  -- a staff meeting). Everything else on the calendar points at a family.
  family_id uuid references public.families(id) on delete cascade,

  -- Optional narrowing, same idea as case_notes: "Maya's passport renewal"
  -- is about one child; "Kings' College deadline" is about one application.
  -- Recording which lets the calendar be read back per child or per
  -- application later, not just parsed out of the title.
  child_id uuid references public.children(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,

  kind text not null default 'reminder'
    check (kind in ('deadline', 'reminder', 'team_event', 'other')),

  title text not null check (length(btrim(title)) > 0),
  notes text,

  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default true,

  status text not null default 'upcoming'
    check (status in ('upcoming', 'done', 'cancelled')),

  -- The whole reason this is its own table. See the header above.
  visible_to_client boolean not null default false,

  -- Who scheduled it — drives the "filter by consultant" view. Locked by
  -- the trigger below once set, same reasoning as case_notes.author_id:
  -- one consultant should never be able to make an event look like it was
  -- someone else's doing, on purpose or by a bad client.
  created_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The calendar view is always "this month, in order" or "this family, in
-- order" — index for both.
create index if not exists idx_calendar_events_starts on public.calendar_events(starts_at);
create index if not exists idx_calendar_events_family on public.calendar_events(family_id, starts_at);
create index if not exists idx_calendar_events_created_by on public.calendar_events(created_by);

comment on table public.calendar_events is
  'Deadlines, consultant reminders, and team events. Staff can see and manage everything; a family can see only their own events where visible_to_client is true. Unlike tasks/case_notes, this table is meant to be partly client-facing — visible_to_client is the one thing that decides it, per row.';

comment on column public.calendar_events.visible_to_client is
  'Defaults to false. A founder turns this on per event to have it also show on that family''s dashboard. Never set from the client side — the family-read policy below only ever reads this column, it can never write it.';

comment on column public.calendar_events.created_by is
  'The staff member who scheduled the event. Nullable and ON DELETE SET NULL so removing a login never deletes calendar history. Locked by the trigger below — it cannot be reassigned by editing the row.';

alter table public.calendar_events enable row level security;

-- Staff: full access to every event, same shape as tasks/case_notes.
drop policy if exists "calendar_events_staff_all" on public.calendar_events;
create policy "calendar_events_staff_all" on public.calendar_events
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- Families: READ-ONLY, and only their own events where a founder has
-- explicitly marked it visible. No insert/update/delete policy at all for
-- families — a family can never create, edit, or "un-hide" a calendar event,
-- not even their own.
drop policy if exists "calendar_events_client_read" on public.calendar_events;
create policy "calendar_events_client_read" on public.calendar_events
  for select
  using (
    visible_to_client = true
    and family_id in (select id from public.families where account_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Authorship integrity — same pattern as case_notes_set_author.
-- ----------------------------------------------------------------------------
create or replace function public.calendar_events_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    -- Who scheduled it never changes, whoever is editing it later.
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_author on public.calendar_events;
create trigger calendar_events_author
  before insert or update on public.calendar_events
  for each row execute function public.calendar_events_set_author();
