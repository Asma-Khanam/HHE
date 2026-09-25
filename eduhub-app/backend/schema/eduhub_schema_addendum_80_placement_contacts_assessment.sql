-- Addendum 80 (25 Sept 2026): founders' round
--   1. Assessment meeting details (time, meeting ID, passcode) the family can see
--   2. School contacts: many per school, each with a job title
--   3. One-month check-in task after a child starts school
--   4. Stages update themselves from the real data, including Placed
-- Safe to re-run. Needs addenda 3, 48, 64, 68 and 70 already run
-- (71 doesn't need to have been run, everything it did is redone here).

-- 1. Assessment ---------------------------------------------------------------
alter table public.applications
  add column if not exists assessment_time time,
  add column if not exists assessment_meeting_id text,
  add column if not exists assessment_passcode text;

-- 2. School contacts --------------------------------------------------------
-- No delete policy: someone who leaves is archived (archived_at), not erased.
create table if not exists public.school_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text,
  job_title text,
  email text,
  phone text,
  is_main boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_school_contacts_school on public.school_contacts(school_id, created_at);

alter table public.school_contacts enable row level security;
drop policy if exists "staff read school contacts" on public.school_contacts;
create policy "staff read school contacts" on public.school_contacts for select using (public.is_staff());
drop policy if exists "staff add school contacts" on public.school_contacts;
create policy "staff add school contacts" on public.school_contacts for insert with check (public.is_staff());
drop policy if exists "staff edit school contacts" on public.school_contacts;
create policy "staff edit school contacts" on public.school_contacts for update using (public.is_staff()) with check (public.is_staff());

-- The existing single contact on each school becomes its first (main) contact.
insert into public.school_contacts (school_id, full_name, job_title, email, phone, is_main, created_by)
select s.id, s.admissions_contact_name, 'Admissions', s.admissions_contact_email, s.admissions_contact_phone, true, null
from public.schools s
where coalesce(s.admissions_contact_name, s.admissions_contact_email, s.admissions_contact_phone) is not null
  and not exists (select 1 from public.school_contacts c where c.school_id = s.id);

-- The main contact is copied onto the school row, so everything that
-- already reads schools.admissions_contact_* (the family's app too) keeps working.
create or replace function public.sync_school_main_contact(p_school_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin
  select * into c
  from public.school_contacts
  where school_id = p_school_id and archived_at is null
  order by is_main desc, created_at
  limit 1;

  update public.schools
  set admissions_contact_name = c.full_name,
      admissions_contact_email = c.email,
      admissions_contact_phone = c.phone
  where id = p_school_id;
end;
$$;

create or replace function public.school_contacts_sync_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_school_main_contact(new.school_id);
  return new;
end;
$$;

drop trigger if exists school_contacts_sync_trg on public.school_contacts;
create trigger school_contacts_sync_trg
  after insert or update on public.school_contacts
  for each row execute function public.school_contacts_sync_trg_fn();

-- 3. One-month check-in -------------------------------------------------------
-- Saving a start date adds a task for one month later, for the family's
-- owner. Moving the start date moves the task (unless it's already done).
alter table public.family_placements
  add column if not exists month_task_id uuid references public.tasks(id) on delete set null;

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
  else
    select owner_staff_id into v_owner from public.families where id = new.family_id;
    insert into public.tasks (family_id, title, due_date, assigned_to, created_by)
    values (new.family_id, v_title, v_due, v_owner, auth.uid())
    returning id into new.month_task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists placement_month_checkin_trg on public.family_placements;
create trigger placement_month_checkin_trg
  before insert or update of start_date, school_name, child_id on public.family_placements
  for each row execute function public.placement_month_checkin_trg_fn();

-- Placements saved before today get their task too.
update public.family_placements set start_date = start_date where month_task_id is null;

-- 4. Stages update themselves ------------------------------------------------
-- Pipeline stage is worked out from the data every time something changes,
-- both ways (a withdrawn offer moves it back too). Placed = an offer
-- accepted, a start date saved, or client stage set to Placed.
create or replace function public.compute_pipeline_stage(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_placed boolean := false;
  v_has_offer boolean := false;
  v_has_application boolean := false;
  v_has_visit boolean := false;
  v_has_shortlist boolean := false;
begin
  select
    coalesce(bool_or(a.status = 'offer_accepted'), false),
    coalesce(bool_or(a.status in ('offer', 'offer_accepted')), false),
    coalesce(bool_or(a.status not in ('draft', 'withdrawn')), false)
  into v_placed, v_has_offer, v_has_application
  from public.applications a
  join public.children c on c.id = a.child_id
  where c.family_id = p_family_id;

  v_placed := v_placed
    or exists (select 1 from public.family_placements p where p.family_id = p_family_id)
    or exists (select 1 from public.families f where f.id = p_family_id and f.client_stage = 'placed');

  select
    count(*) > 0,
    coalesce(bool_or(s.tour_status in ('offered', 'confirmed', 'completed')
                  or s.tour2_status in ('offered', 'confirmed', 'completed')), false)
  into v_has_shortlist, v_has_visit
  from public.school_shortlist s
  where s.family_id = p_family_id;

  if v_placed then return 'placed';
  elsif v_has_offer then return 'offer';
  elsif v_has_application then return 'assessed';
  elsif v_has_visit then return 'applied';
  elsif v_has_shortlist then return 'profile';
  else return 'enquiry';
  end if;
end;
$$;

create or replace function public.sync_family_stages(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage text;
begin
  if p_family_id is null then return; end if;
  v_stage := public.compute_pipeline_stage(p_family_id);
  perform set_config('app.bypass_client_guard', 'true', true);

  update public.families set pipeline_stage = v_stage
  where id = p_family_id and pipeline_stage is distinct from v_stage;

  if v_stage = 'placed' then
    update public.families set client_stage = 'placed'
    where id = p_family_id and client_stage is distinct from 'placed';
  end if;
end;
$$;

-- The existing triggers (applications, shortlist, intake) all call this,
-- so they now use the new rules.
create or replace function public.advance_pipeline_stage(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_family_stages(p_family_id);
end;
$$;

create or replace function public.applications_advance_stage_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id from public.children where id = coalesce(new.child_id, old.child_id);
  perform public.sync_family_stages(v_family_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists applications_advance_stage_trg on public.applications;
create trigger applications_advance_stage_trg
  after insert or update of status or delete on public.applications
  for each row execute function public.applications_advance_stage_trg_fn();

create or replace function public.shortlist_advance_stage_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_family_stages(coalesce(new.family_id, old.family_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists shortlist_advance_stage_trg on public.school_shortlist;
create trigger shortlist_advance_stage_trg
  after insert or update or delete on public.school_shortlist
  for each row execute function public.shortlist_advance_stage_trg_fn();

create or replace function public.placements_advance_stage_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_family_stages(coalesce(new.family_id, old.family_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists placements_advance_stage_trg on public.family_placements;
create trigger placements_advance_stage_trg
  after insert or update or delete on public.family_placements
  for each row execute function public.placements_advance_stage_trg_fn();

-- Client stage set to Placed by hand moves the pipeline stage too.
create or replace function public.families_client_stage_sync_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_stage is distinct from old.client_stage then
    perform public.sync_family_stages(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists families_client_stage_sync_trg on public.families;
create trigger families_client_stage_sync_trg
  after update of client_stage on public.families
  for each row execute function public.families_client_stage_sync_trg_fn();

-- Bring every family up to date now.
do $$
declare r record;
begin
  for r in select id from public.families loop
    perform public.sync_family_stages(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
