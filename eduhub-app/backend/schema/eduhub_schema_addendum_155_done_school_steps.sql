-- Addendum 155: mark school-step tasks done from the Today page (Nov 2026)
-- The "school replied", "availability email not sent" and similar items on the
-- Today list are worked out live, so they had nowhere to remember "done".
-- This table remembers which ones a person ticked, who ticked them and when,
-- so they show on the Done tab instead of vanishing. Staff only.
-- Safe to run more than once.

create table if not exists public.action_done (
  action_key text primary key,
  family_id uuid references public.families(id) on delete cascade,
  title text,
  done_at timestamptz not null default now(),
  done_by uuid references auth.users(id) on delete set null
);

create index if not exists action_done_family_idx on public.action_done (family_id);
create index if not exists action_done_done_at_idx on public.action_done (done_at desc);

-- The database stamps who and when from the login, so nobody can tick
-- something under another person's name.
create or replace function public.action_done_stamp_trg_fn()
returns trigger
language plpgsql
as $$
begin
  new.done_by := auth.uid();
  new.done_at := now();
  return new;
end;
$$;

drop trigger if exists action_done_stamp_trg on public.action_done;
create trigger action_done_stamp_trg
  before insert or update on public.action_done
  for each row execute function public.action_done_stamp_trg_fn();

alter table public.action_done enable row level security;

drop policy if exists "action_done_staff_all" on public.action_done;
create policy "action_done_staff_all" on public.action_done
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

comment on table public.action_done is
  'School-step actions on the Today list that a staff member ticked as done (who and when). Staff only. See addendum 155.';

notify pgrst, 'reload schema';
