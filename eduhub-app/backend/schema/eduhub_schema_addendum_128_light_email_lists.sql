-- Addendum 128 (22 Oct 2026): make the Emails tab load fast.
--
-- The Emails tab used to download the full text of every email (over a thousand of
-- them) every time it opened, refreshed, or after any delete or move. These two views
-- give it the same list with only the first 400 characters of each email, which is all
-- the list preview needs. The full email is still fetched when one is opened.
--
-- security_invoker means the existing staff-only rules on case_notes and
-- unmatched_emails still apply: whoever could not read an email before still cannot.
-- Safe to re-run.

create or replace view public.email_list
with (security_invoker = true) as
select
  id, family_id, direction, subject,
  left(body, 400) as body,
  email_from, email_from_name, email_to, email_cc,
  occurred_at, read_at, mailbox_folder, email_attachments
from public.case_notes
where kind = 'email';

create or replace view public.unmatched_email_list
with (security_invoker = true) as
select
  id, received_at, alias, email_from, email_from_name, email_to, email_cc, subject,
  left(email_text, 400) as email_text,
  email_attachments, read_at, mailbox_folder, status
from public.unmatched_emails;

grant select on public.email_list to authenticated;
grant select on public.unmatched_email_list to authenticated;

notify pgrst, 'reload schema';
