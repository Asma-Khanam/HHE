-- Addendum 146 (30 Oct 2026): "was it opened?" for emails sent from the dashboard.
-- Emails sent from a family's Emails tab now carry a tiny invisible image. When the
-- school's mail program loads it, api/email-open records the first and last time and
-- how many times. The Emails tab shows "Opened" or "Not opened yet" on sent emails.
-- (Only a rough signal: some mail programs block images, and some, like Apple Mail
-- with Mail Privacy Protection, load them for the reader.)
-- Safe to re-run.

alter table public.case_notes add column if not exists email_first_opened_at timestamptz;
alter table public.case_notes add column if not exists email_last_opened_at timestamptz;
alter table public.case_notes add column if not exists email_open_count integer not null default 0;
