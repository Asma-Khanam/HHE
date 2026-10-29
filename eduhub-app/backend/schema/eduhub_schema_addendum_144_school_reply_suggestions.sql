-- Addendum 144: email automation -- what Claude read out of a school's reply.
-- Nothing here changes a family's record by itself. Each row is a suggestion
-- the consultant confirms (status 'accepted') or dismisses; confirming is what
-- writes the availability, tour and assessment fields on the school's row.

create table if not exists public.school_reply_suggestions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  shortlist_id uuid references public.school_shortlist(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  note_id uuid references public.case_notes(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  summary text,
  -- [{ "child_id": "...", "child_name": "...", "status": "yes|waitlist|no|some_year_groups" }]
  availability jsonb not null default '[]'::jsonb,
  -- [{ "label": "primary|secondary", "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM" }]
  tour_slots jsonb not null default '[]'::jsonb,
  -- [{ "child_id": "...", "child_name": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "how": "online|at the school|video" }]
  assessment_dates jsonb not null default '[]'::jsonb,
  match_note text,
  model text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create unique index if not exists school_reply_suggestions_note_shortlist
  on public.school_reply_suggestions (note_id, shortlist_id);
create index if not exists school_reply_suggestions_family
  on public.school_reply_suggestions (family_id, status);

alter table public.school_reply_suggestions enable row level security;

drop policy if exists "staff read reply suggestions" on public.school_reply_suggestions;
create policy "staff read reply suggestions" on public.school_reply_suggestions
  for select using (public.is_staff());

drop policy if exists "staff update reply suggestions" on public.school_reply_suggestions;
create policy "staff update reply suggestions" on public.school_reply_suggestions
  for update using (public.is_staff()) with check (public.is_staff());

-- Rows are written only by the email webhook (service role, which bypasses RLS).
-- Families never see this table.

notify pgrst, 'reload schema';
