-- Addendum 95 (8 Oct 2026): two fixes from the 8 Oct meeting.
--
-- 1. Application fee invoices can be uploaded for ANY family, even one that has not
--    made an account yet. Files now live at families/{family_id}/... in the documents
--    bucket. Staff can already write there (addendum 35); this adds read access for
--    the family once they sign up.
--
-- 2. To-dos you delete stay deleted. Two automatic jobs were quietly re-creating them:
--      - the daily "chase the school" job (it re-raised the task whenever the old one was gone)
--      - the one-month check-in task (re-created whenever the placement was saved again)
--    Each now remembers that it already raised its task, so removing it is final.
-- Nothing is deleted by this file. Safe to re-run.

-- 1. Family can read invoices kept under their own family id ------------------
drop policy if exists "family_read_family_folder" on storage.objects;
create policy "family_read_family_folder"
on storage.objects
for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'families'
  and (storage.foldername(name))[2] in (
    select f.id::text from public.families f where f.account_user_id = auth.uid()
  )
);

-- 2a. Chase tasks: remember they were raised -----------------------------------
alter table public.school_shortlist add column if not exists chase_raised_at timestamptz;
-- Anything already old enough has had its chance; do not bring back ones you removed.
update public.school_shortlist
set chase_raised_at = coalesce(chase_raised_at, now())
where chase_raised_at is null
  and availability_status = 'awaiting'
  and public.working_days_between(shortlisted_at, now()) >= 3;

create or replace function public.raise_school_shortlist_chase_tasks()
returns void
language plpgsql
as $$
declare
  r record;
  v_task_id uuid;
begin
  for r in
    select ss.id, ss.family_id, ss.school_id, ss.shortlisted_at, ss.chase_raised_at, ss.chase_escalated_at,
           f.owner_staff_id, s.name as school_name
    from public.school_shortlist ss
    join public.families f on f.id = ss.family_id
    join public.schools s on s.id = ss.school_id
    where ss.availability_status = 'awaiting'
  loop
    if r.chase_raised_at is null and public.working_days_between(r.shortlisted_at, now()) >= 3 then
      insert into public.tasks (family_id, title, due_date, assigned_to)
      values (r.family_id, 'Chase ' || r.school_name || ' for an availability reply', current_date, r.owner_staff_id)
      returning id into v_task_id;
      update public.school_shortlist set chase_task_id = v_task_id, chase_raised_at = now() where id = r.id;
    end if;

    if r.chase_escalated_at is null and public.working_days_between(r.shortlisted_at, now()) >= 5 then
      insert into public.tasks (family_id, title, due_date, assigned_to)
      values (r.family_id, 'ESCALATE — ' || r.school_name || ' still hasn''t replied on availability (5+ working days)', current_date, r.owner_staff_id);
      update public.school_shortlist set chase_escalated_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.raise_school_shortlist_chase_tasks() from public, anon, authenticated;

-- 2b. One-month check-in: only ever created once -------------------------------
alter table public.family_placements add column if not exists month_task_raised boolean not null default false;
update public.family_placements set month_task_raised = true where month_task_raised = false;

create or replace function public.placement_month_checkin_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child text;
  v_owner uuid;
  v_title text;
  v_due date := (new.start_date + interval '1 month')::date;
begin
  select coalesce(nullif(btrim(c.preferred_name), ''), nullif(btrim(c.first_name), ''), split_part(c.full_name, ' ', 1))
  into v_child
  from public.children c
  where c.id = new.child_id;

  v_title := coalesce(v_child, 'Your student') || ' has been at ' || new.school_name
    || ' for a month: send the family a check-in email';

  if new.month_task_id is not null and exists (select 1 from public.tasks where id = new.month_task_id) then
    update public.tasks
    set title = v_title, due_date = v_due
    where id = new.month_task_id and done_at is null;
  elsif coalesce(new.month_task_raised, false) then
    null; -- it was created before and has since been removed on purpose: leave it gone
  else
    select owner_staff_id into v_owner from public.families where id = new.family_id;
    insert into public.tasks (family_id, title, due_date, assigned_to, created_by)
    values (new.family_id, v_title, v_due, v_owner, auth.uid())
    returning id into new.month_task_id;
    new.month_task_raised := true;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
