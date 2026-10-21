-- 127: Titan folders on the Emails page, and read state for Not filed emails.
--  * mailbox_folder on case_notes and unmatched_emails: inbox, spam, archive or trash,
--    kept in step with the Titan mailbox by the Titan email sync.
--  * read_at on unmatched_emails, so Not filed mail shows bold until someone opens it.
--  * mark_unmatched_read(): staff open a Not filed email -> it counts as read.
--  * file_unmatched_email now carries the folder and read state onto the family.
-- Safe to re-run. Nothing is deleted. Run this BEFORE pushing the matching code.

alter table public.case_notes
  add column if not exists mailbox_folder text not null default 'inbox'
  check (mailbox_folder in ('inbox', 'spam', 'archive', 'trash'));

alter table public.unmatched_emails
  add column if not exists mailbox_folder text not null default 'inbox'
  check (mailbox_folder in ('inbox', 'spam', 'archive', 'trash'));

alter table public.unmatched_emails
  add column if not exists read_at timestamptz;

create index if not exists idx_case_notes_email_folder
  on public.case_notes (mailbox_folder, occurred_at desc)
  where kind = 'email';

-- Everything that arrived before today counts as already read.
update public.unmatched_emails
   set read_at = coalesce(read_at, received_at)
 where read_at is null
   and received_at < '2026-10-22 00:00:00+05:30';

create or replace function public.mark_unmatched_read(p_id uuid, p_read boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  update public.unmatched_emails
     set read_at = case when p_read then coalesce(read_at, now()) else null end
   where id = p_id;
end;
$$;
revoke execute on function public.mark_unmatched_read(uuid, boolean) from public, anon;
grant execute on function public.mark_unmatched_read(uuid, boolean) to authenticated;

-- Filing a Not filed email keeps its folder and read state.
create or replace function public.file_unmatched_email(p_id uuid, p_family uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.unmatched_emails%rowtype;
  v_note uuid;
  v_snippet text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into u from public.unmatched_emails where id = p_id for update;
  if not found then raise exception 'That email was not found.'; end if;
  if u.status <> 'open' then raise exception 'That email has already been handled.'; end if;
  if not exists (select 1 from public.families where id = p_family) then raise exception 'Choose a family.'; end if;

  v_snippet := left(regexp_replace(coalesce(u.email_text, ''), '\s+', ' ', 'g'), 400);

  insert into public.case_notes (
    family_id, kind, body, subject, direction, occurred_at,
    email_from, email_from_name, email_to, email_cc,
    email_html, email_text, email_message_id,
    mailbox_folder, read_at
  )
  values (
    p_family, 'email',
    coalesce(nullif(btrim(v_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || coalesce(u.email_from, '(unknown sender)'),
    u.subject, 'inbound', u.received_at,
    u.email_from, u.email_from_name, u.email_to, u.email_cc,
    u.email_html, u.email_text, u.email_message_id,
    u.mailbox_folder, u.read_at
  )
  returning id into v_note;

  update public.unmatched_emails
     set status = 'filed', filed_family_id = p_family, filed_note_id = v_note,
         handled_by = auth.uid(), handled_at = now()
   where id = p_id;

  return v_note;
end;
$$;
revoke execute on function public.file_unmatched_email(uuid, uuid) from public, anon;
grant execute on function public.file_unmatched_email(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
