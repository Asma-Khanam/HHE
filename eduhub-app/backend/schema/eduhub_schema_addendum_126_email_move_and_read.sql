-- 126: Emails page quick fixes.
--  * move_email_note: staff can move a filed email to another family.
--  * reopen_unmatched_email: undo a "Not a family email" dismissal.
--  * one-off: sent mail is never unread, and everything before 22 Oct 2026 is read.
-- Safe to re-run. Nothing is deleted.

create or replace function public.move_email_note(p_note uuid, p_family uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;
  update public.case_notes
     set family_id = p_family,
         child_id = null
   where id = p_note
     and kind = 'email';
  if not found then
    raise exception 'email not found';
  end if;
end;
$$;

create or replace function public.reopen_unmatched_email(p_id uuid)
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
     set status = 'open', handled_by = null, handled_at = null
   where id = p_id and status = 'dismissed';
end;
$$;

grant execute on function public.move_email_note(uuid, uuid) to authenticated;
grant execute on function public.reopen_unmatched_email(uuid) to authenticated;

-- Data fix: sent mail is never unread; history before today counts as read.
update public.case_notes
   set read_at = coalesce(read_at, now())
 where kind = 'email'
   and read_at is null
   and (direction = 'outbound' or occurred_at < '2026-10-22 00:00:00+05:30');

notify pgrst, 'reload schema';
