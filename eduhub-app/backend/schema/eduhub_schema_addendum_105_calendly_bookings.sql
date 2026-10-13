-- Addendum 105 (13 Oct 2026): Calendly bookings saved on the family's Meetings tab.
--
-- When a family books a call in Calendly, Calendly sends a webhook to
-- /api/calendly-webhook. That function matches the booker's email to a parent,
-- saves a "meeting" note on the family's case, and records the booking here.
-- If the Zoom link is in the booking, it is also saved in zoom_meeting_links
-- (addendum 89) so the Zoom AI summary lands on the same family afterwards.
-- A booking whose email matches nobody is still saved here (family_id empty)
-- so staff can see it and link it by hand.
-- Nothing is ever deleted. Needs addenda 5, 7 and 89. Safe to re-run.

create table if not exists public.calendly_bookings (
  id uuid primary key default gen_random_uuid(),
  invitee_uri text not null unique,        -- Calendly's id for this booking (one per invitee)
  family_id uuid references public.families(id) on delete set null,
  invitee_name text,
  invitee_email text,
  event_name text,
  host_name text,
  start_time timestamptz,
  end_time timestamptz,
  join_url text,
  status text not null default 'active' check (status in ('active', 'canceled')),
  rescheduled boolean not null default false,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_calendly_bookings_family on public.calendly_bookings(family_id, start_time desc);
create index if not exists idx_calendly_bookings_email on public.calendly_bookings(lower(invitee_email));

alter table public.calendly_bookings enable row level security;
drop policy if exists "staff read calendly bookings" on public.calendly_bookings;
create policy "staff read calendly bookings" on public.calendly_bookings for select using (public.is_staff());
drop policy if exists "staff link calendly bookings" on public.calendly_bookings;
create policy "staff link calendly bookings" on public.calendly_bookings for update using (public.is_staff()) with check (public.is_staff());
-- Rows are written by the webhook with the service role key, which bypasses RLS.

-- A small log of what Calendly sends, so a missing booking can be traced
-- (Vercel's free plan only keeps about an hour of logs). Never stores the
-- booking's answers or notes, only the event name, who and what happened.
create table if not exists public.calendly_webhook_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event text,
  invitee_email text,
  outcome text not null,
  detail text
);
create index if not exists idx_calendly_webhook_log_time on public.calendly_webhook_log(received_at desc);

alter table public.calendly_webhook_log enable row level security;
drop policy if exists "staff read calendly webhook log" on public.calendly_webhook_log;
create policy "staff read calendly webhook log" on public.calendly_webhook_log for select using (public.is_staff());

notify pgrst, 'reload schema';
