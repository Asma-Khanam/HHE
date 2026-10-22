-- Addendum 129 (22 Oct 2026): failed-email log and Flag.
--
-- 1. email_intake_failures: when an email reaches the website's inbound handler but
--    cannot be filed, one row is saved here (who from, the subject, why). The Emails
--    tab shows a count so a failure is never silent. The 30 minute Titan sync still
--    picks the email up from Titan; staff dismiss a row once they have checked it.
--    Only the server writes rows; staff can read them and mark them resolved.
-- 2. flagged on case_notes and unmatched_emails: the Flag button on the Emails tab.
--    The server also sets Titan's own Flagged mark.
-- 3. The two light list views from addendum 128 gain the flagged column.
-- Run after 128. Safe to re-run.

create table if not exists public.email_intake_failures (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  alias       text,
  email_from  text,
  subject     text,
  message_id  text,
  reason      text,
  resolved_at timestamptz
);

create index if not exists idx_email_intake_failures_open
  on public.email_intake_failures (created_at desc) where resolved_at is null;

alter table public.email_intake_failures enable row level security;

drop policy if exists email_intake_failures_staff_read on public.email_intake_failures;
create policy email_intake_failures_staff_read on public.email_intake_failures
  for select to authenticated using (public.is_staff());

drop policy if exists email_intake_failures_staff_resolve on public.email_intake_failures;
create policy email_intake_failures_staff_resolve on public.email_intake_failures
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, update on public.email_intake_failures to authenticated;

alter table public.case_notes      add column if not exists flagged boolean not null default false;
alter table public.unmatched_emails add column if not exists flagged boolean not null default false;

create or replace view public.email_list
with (security_invoker = true) as
select
  id, family_id, direction, subject,
  left(body, 400) as body,
  email_from, email_from_name, email_to, email_cc,
  occurred_at, read_at, mailbox_folder, email_attachments,
  flagged
from public.case_notes
where kind = 'email';

create or replace view public.unmatched_email_list
with (security_invoker = true) as
select
  id, received_at, alias, email_from, email_from_name, email_to, email_cc, subject,
  left(email_text, 400) as email_text,
  email_attachments, read_at, mailbox_folder, status,
  flagged
from public.unmatched_emails;

grant select on public.email_list to authenticated;
grant select on public.unmatched_email_list to authenticated;

notify pgrst, 'reload schema';
