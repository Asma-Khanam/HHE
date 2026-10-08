-- Addendum 97 (8 Oct 2026): a small log of what Zoom sends to the webhook.
-- Vercel's free plan only keeps about an hour of logs, so a missing meeting
-- summary couldn't be traced. This records, for every call: when, which Zoom
-- event, which meeting id, and what happened. It never stores the summary text.
-- Safe to re-run.

create table if not exists public.zoom_webhook_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event text,
  meeting_id text,
  outcome text not null,
  detail text
);
create index if not exists idx_zoom_webhook_log_time on public.zoom_webhook_log(received_at desc);

alter table public.zoom_webhook_log enable row level security;
drop policy if exists "staff read zoom webhook log" on public.zoom_webhook_log;
create policy "staff read zoom webhook log" on public.zoom_webhook_log for select using (public.is_staff());
-- Rows are written by the webhook with the service role key, which bypasses RLS.

notify pgrst, 'reload schema';
