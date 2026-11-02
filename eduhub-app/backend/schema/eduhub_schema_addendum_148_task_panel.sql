-- Addendum 148: the task panel on the Today page (Nov 2026)
-- A note for whoever picks a task up, and who gave it / who finished it.
-- The database stamps the people from the login itself, so nobody can write
-- under someone else's name. Automatic tasks (made by the schedule) have no
-- login, so they simply show as automatic.

alter table public.tasks
  add column if not exists note text,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists done_by uuid references auth.users(id) on delete set null;

create or replace function public.tasks_stamp_people_trg_fn()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      new.assigned_by := auth.uid();
      new.assigned_at := now();
    end if;
    if new.done_at is not null then
      new.done_by := auth.uid();
    end if;
  else
    if new.assigned_to is distinct from old.assigned_to then
      if new.assigned_to is null then
        new.assigned_by := null;
        new.assigned_at := null;
      else
        new.assigned_by := auth.uid();
        new.assigned_at := now();
      end if;
    else
      new.assigned_by := old.assigned_by;
      new.assigned_at := old.assigned_at;
    end if;
    if new.done_at is distinct from old.done_at then
      new.done_by := case when new.done_at is null then null else auth.uid() end;
    else
      new.done_by := old.done_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_stamp_people_trg on public.tasks;
create trigger tasks_stamp_people_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_stamp_people_trg_fn();

notify pgrst, 'reload schema';
