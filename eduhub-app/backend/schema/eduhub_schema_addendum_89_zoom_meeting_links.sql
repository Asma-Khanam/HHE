-- Addendum 89 (5 Oct 2026): Zoom calls link to a family and save their own notes.
--
-- Heather: "If we have a call with a family on the system, we link the zoom
-- meeting to their account and it automatically saves the notes."
--
-- A consultant pastes the Zoom invite on the family's Meetings tab. That
-- stores the Zoom meeting ID against the family here. When the call ends,
-- Zoom's AI Companion summary is sent to /api/zoom-webhook, which finds the
-- family by meeting ID and saves the summary as a Meetings note.
-- If the same meeting ID is linked to more than one family (e.g. a personal
-- meeting room), the most recently linked family gets the summary.
-- Nothing is ever deleted. Needs addenda 2 and 5. Safe to re-run.

create table if not exists public.zoom_meeting_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  zoom_meeting_id text not null,
  join_url text,
  topic text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_zoom_links_meeting on public.zoom_meeting_links(zoom_meeting_id, created_at desc);
create index if not exists idx_zoom_links_family on public.zoom_meeting_links(family_id);

alter table public.zoom_meeting_links enable row level security;
drop policy if exists "staff read zoom links" on public.zoom_meeting_links;
create policy "staff read zoom links" on public.zoom_meeting_links for select using (public.is_staff());
drop policy if exists "staff add zoom links" on public.zoom_meeting_links;
create policy "staff add zoom links" on public.zoom_meeting_links for insert with check (public.is_staff());
drop policy if exists "staff edit zoom links" on public.zoom_meeting_links;
create policy "staff edit zoom links" on public.zoom_meeting_links for update using (public.is_staff()) with check (public.is_staff());
-- No delete policy.

-- Lets the webhook save each Zoom meeting's summary only once.
alter table public.case_notes add column if not exists external_ref text;
create unique index if not exists idx_case_notes_external_ref on public.case_notes(external_ref);

notify pgrst, 'reload schema';
