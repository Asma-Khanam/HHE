-- 90: read / unread for emails. read_at is null = unread (inbound emails only matter).
alter table public.case_notes add column if not exists read_at timestamptz;
-- Everything already in the system counts as read; only new replies arrive unread.
update public.case_notes set read_at = now() where kind = 'email' and read_at is null;
notify pgrst, 'reload schema';
