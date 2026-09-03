-- ============================================================================
-- Addendum 5 — 2026-09-03: case notes
--
-- What this is for
-- ----------------
-- The founders' own mockup has two panels this covers: "School conversations
-- · Log a call", and an Activity feed captioned "Anyone can pick up here."
-- That caption is the whole point. Right now everything the team knows about
-- a family that isn't a form field — what the school said on the phone, why
-- they ruled a school out, what was promised and when — lives in somebody's
-- head or their own inbox. The moment a second consultant covers that family,
-- it's gone.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement is IF NOT EXISTS / DROP-then-CREATE.
--   Run addendums 2 and 3 first — this file uses the `staff` table and the
--   is_staff() function they created.
--
-- THE ONE THING TO UNDERSTAND HERE: these notes are INTERNAL. A family must
-- never read them. That isn't a UI decision that could be undone by someone
-- pointing a different app at the same database — it's enforced here, by
-- there being no policy on this table that grants a family anything at all.
-- The only policy is is_staff(), same shape as `tasks` in addendum 3. If a
-- family-visible version is ever wanted, that's a separate, deliberate policy
-- and a separate decision, not a flag someone can flip by accident.
-- ============================================================================

create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,

  -- Optional narrowing. A note is usually about the family, but "Maya's CAT4
  -- went well" is about one child, and "Kings' said they're full for Year 4"
  -- is about one school — recording which lets the record be read back per
  -- child or per school later without parsing anybody's prose.
  child_id uuid references public.children(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,

  -- What kind of thing happened. Deliberately a short, closed list: a free
  -- text "type" would drift into fifteen spellings of "phone call" within a
  -- month and be useless to filter on.
  kind text not null default 'note'
    check (kind in ('note', 'call', 'email', 'meeting', 'school', 'decision')),

  body text not null check (length(btrim(body)) > 0),

  -- When it actually happened, which is not always when it was typed up —
  -- a call on Friday logged on Monday should sit on Friday in the timeline.
  occurred_at timestamptz not null default now(),

  -- Who wrote it. on delete set null rather than cascade: a consultant
  -- leaving must not silently delete the history of every family they
  -- touched. The note survives, unattributed.
  author_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- The timeline query is always "this family, newest first", so index for it.
create index if not exists idx_case_notes_family on public.case_notes(family_id, occurred_at desc);
create index if not exists idx_case_notes_child on public.case_notes(child_id);

comment on table public.case_notes is
  'Internal case notes and call log, one row per logged interaction. Staff only — families have no read access to this table at all, and no policy grants it. Same rule as public.tasks.';

comment on column public.case_notes.occurred_at is
  'When the thing being logged actually happened, which may be earlier than created_at if it was written up later. The timeline orders by this.';

comment on column public.case_notes.author_id is
  'The staff member who wrote the note. Nullable and ON DELETE SET NULL so removing a login never deletes case history.';

alter table public.case_notes enable row level security;

-- The only policy on this table. No family-facing counterpart, by design.
drop policy if exists "case_notes_staff_all" on public.case_notes;
create policy "case_notes_staff_all" on public.case_notes
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- Authorship integrity
--
-- RLS can say "a staff member may insert a row here", but not "and the
-- author_id had better be their own". Without this, one consultant could
-- write a note under another's name — not likely on purpose, easy by
-- accident through a bad client, and it quietly makes the whole log
-- untrustworthy. The trigger stamps the author server-side and ignores
-- whatever the client sent, which also means the app never has to remember
-- to set it.
-- ----------------------------------------------------------------------------
create or replace function public.case_notes_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    -- The author of a note never changes, whoever is editing it.
    new.author_id := old.author_id;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists case_notes_author on public.case_notes;
create trigger case_notes_author
  before insert or update on public.case_notes
  for each row execute function public.case_notes_set_author();
