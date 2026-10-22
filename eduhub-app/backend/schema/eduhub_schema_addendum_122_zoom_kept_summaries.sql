-- Addendum 122 (21 Oct 2026): Zoom summaries are kept even when no family is linked yet.
--
-- Until now, a Zoom AI summary for a meeting with no family linked was thrown
-- away ("not_linked" in zoom_webhook_log). That is what happened to the
-- consultations on 20 Oct: the booker (a new enquirer) was not a family in the
-- system yet, so there was nothing to attach the notes to.
--
-- Now the webhook keeps those summaries here. Two things use them:
--   * Consultations page: shows the summary on the booking whose Zoom link has
--     the same meeting ID, with or without a family.
--   * the moment a Zoom meeting is linked to a family (Meetings tab, or linking a
--     consultation to a family) the kept summary is added to that family's
--     Meetings notes. Pasting the link AFTER the call works too.
--
-- Only staff can read this table; only the server and the trigger below write
-- to it. Safe to re-run.

create table if not exists public.zoom_unmatched_summaries (
  id uuid primary key default gen_random_uuid(),
  zoom_meeting_id text not null,
  topic text,
  body text not null,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  attached_family_id uuid references public.families(id) on delete set null,
  attached_at timestamptz,
  external_ref text not null unique
);
create index if not exists idx_zoom_unmatched_meeting on public.zoom_unmatched_summaries(zoom_meeting_id);

alter table public.zoom_unmatched_summaries enable row level security;
drop policy if exists "staff read kept zoom summaries" on public.zoom_unmatched_summaries;
create policy "staff read kept zoom summaries" on public.zoom_unmatched_summaries
  for select using (public.is_staff());
-- No insert/update/delete policies: the webhook (service role) and the trigger write.

-- When a meeting is linked to a family, add any summary already kept for it.
create or replace function public.zoom_attach_kept_summaries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.case_notes (family_id, kind, subject, body, occurred_at, external_ref)
  select
    new.family_id,
    'meeting',
    coalesce(nullif(u.topic, ''), nullif(new.topic, ''), 'Zoom meeting'),
    u.body || case when new.join_url is not null and new.join_url <> '' then E'\n\nZoom link: ' || new.join_url else '' end,
    u.occurred_at,
    u.external_ref
  from public.zoom_unmatched_summaries u
  where u.zoom_meeting_id = new.zoom_meeting_id
  on conflict (external_ref) do nothing;

  update public.zoom_unmatched_summaries
     set attached_family_id = new.family_id, attached_at = now()
   where zoom_meeting_id = new.zoom_meeting_id and attached_family_id is null;

  return new;
end;
$$;

drop trigger if exists zoom_links_attach_kept on public.zoom_meeting_links;
create trigger zoom_links_attach_kept
  after insert on public.zoom_meeting_links
  for each row execute function public.zoom_attach_kept_summaries();

-- A consultation's Zoom link can be added by staff when the booking did not carry one.
-- (calendly_bookings already lets staff update; nothing to change there.)

notify pgrst, 'reload schema';
