-- Addendum 147: a task knows where it opens (Today page rebuild, Nov 2026)
-- Adds the tab, the school and the step a task belongs to, fills them in for
-- the tasks that already exist, and makes the automatic tasks fill them in
-- from now on. Tasks with no tab keep opening the family page.

alter table public.tasks
  add column if not exists link_tab text,
  add column if not exists link_school_id uuid references public.schools(id) on delete set null,
  add column if not exists link_step text;

alter table public.tasks drop constraint if exists tasks_link_tab_check;
alter table public.tasks add constraint tasks_link_tab_check
  check (link_tab is null or link_tab in
    ('overview','details','visits','applications','timeline','emails','meetings','accounting','documents'));

-- Existing Chase tasks (the shortlist row remembers its chase task)
update public.tasks t
set link_tab = 'visits', link_school_id = ss.school_id, link_step = 'chase'
from public.school_shortlist ss
where ss.chase_task_id = t.id and t.link_tab is null;

-- Existing ESCALATE tasks (matched by family and the school name in the title)
update public.tasks t
set link_tab = 'visits', link_school_id = s.id, link_step = 'escalate'
from public.school_shortlist ss
join public.schools s on s.id = ss.school_id
where t.link_tab is null
  and t.family_id = ss.family_id
  and t.title = 'ESCALATE — ' || s.name || ' still hasn''t replied on availability (5+ working days)';

-- Existing one-month check-in tasks (the placement is on the Timeline tab)
update public.tasks t
set link_tab = 'timeline', link_step = 'month_checkin'
from public.family_placements fp
where fp.month_task_id = t.id and t.link_tab is null;

-- Chase and ESCALATE tasks from now on
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
      insert into public.tasks (family_id, title, due_date, assigned_to, link_tab, link_school_id, link_step)
      values (r.family_id, 'Chase ' || r.school_name || ' for an availability reply', current_date, r.owner_staff_id,
              'visits', r.school_id, 'chase')
      returning id into v_task_id;
      update public.school_shortlist set chase_task_id = v_task_id, chase_raised_at = now() where id = r.id;
    end if;

    if r.chase_escalated_at is null and public.working_days_between(r.shortlisted_at, now()) >= 5 then
      insert into public.tasks (family_id, title, due_date, assigned_to, link_tab, link_school_id, link_step)
      values (r.family_id, 'ESCALATE — ' || r.school_name || ' still hasn''t replied on availability (5+ working days)', current_date, r.owner_staff_id,
              'visits', r.school_id, 'escalate');
      update public.school_shortlist set chase_escalated_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.raise_school_shortlist_chase_tasks() from public, anon, authenticated;

-- One-month check-in task from now on
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
    insert into public.tasks (family_id, title, due_date, assigned_to, created_by, link_tab, link_step)
    values (new.family_id, v_title, v_due, v_owner, auth.uid(), 'timeline', 'month_checkin')
    returning id into new.month_task_id;
    new.month_task_raised := true;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
