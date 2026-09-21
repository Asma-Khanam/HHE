-- Addendum 68: client stage (Free sanity check / Paid consult / Live / Consultant / Placed)
-- with an entry point and a dated history of every move.
-- Safe to re-run. Needs addenda 2, 12 and 48 already applied.
--
-- This is separate from pipeline_stage (the enquiry -> placed progress bar).
-- client_stage is the caseload grouping; entry_stage never changes once set.

alter table public.families
  add column if not exists client_stage text
    check (client_stage in ('free_sanity_check','paid_consult','live','consultant','placed')),
  add column if not exists entry_stage text
    check (entry_stage in ('free_sanity_check','paid_consult','live','consultant','placed')),
  add column if not exists entry_stage_at timestamptz;

create table if not exists public.family_stage_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  moved_at timestamptz not null default now(),
  moved_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists idx_family_stage_history_family on public.family_stage_history(family_id, moved_at);

alter table public.family_stage_history enable row level security;
drop policy if exists "staff read stage history" on public.family_stage_history;
create policy "staff read stage history" on public.family_stage_history for select using (public.is_staff());
-- No insert/update/delete policy: rows are written only by the trigger below.

-- Existing families: placed ones -> placed, everyone else -> live.
-- (Their true entry point isn't known; entry is set to the same value and
-- dated to when the family record was created. Staff can correct the stage.)
update public.families
set client_stage = case when pipeline_stage = 'placed' then 'placed' else 'live' end
where client_stage is null;

update public.families
set entry_stage = client_stage, entry_stage_at = created_at
where entry_stage is null;

insert into public.family_stage_history (family_id, from_stage, to_stage, moved_at, moved_by)
select f.id, null, f.client_stage, f.created_at, null
from public.families f
where not exists (select 1 from public.family_stage_history h where h.family_id = f.id);

alter table public.families alter column client_stage set default 'free_sanity_check';

-- Record every move; stamp the entry point on first insert.
create or replace function public.families_track_client_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.client_stage is null then new.client_stage := 'free_sanity_check'; end if;
    new.entry_stage := new.client_stage;
    new.entry_stage_at := now();
    return new;
  end if;
  return new;
end;
$$;

create or replace function public.families_log_client_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.family_stage_history (family_id, from_stage, to_stage, moved_by)
    values (new.id, null, new.client_stage, auth.uid());
  elsif new.client_stage is distinct from old.client_stage then
    insert into public.family_stage_history (family_id, from_stage, to_stage, moved_by)
    values (new.id, old.client_stage, new.client_stage, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists families_track_client_stage_trg on public.families;
create trigger families_track_client_stage_trg
  before insert on public.families
  for each row execute function public.families_track_client_stage();

drop trigger if exists families_log_client_stage_trg on public.families;
create trigger families_log_client_stage_trg
  after insert or update of client_stage on public.families
  for each row execute function public.families_log_client_stage();

-- Families can't change their own stage or entry point (same guard as
-- pipeline_stage). Only difference from addendum 48's version: three more columns.
create or replace function public.families_guard_client_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() or current_setting('app.bypass_client_guard', true) = 'true' then
    return new;
  end if;

  if new.pipeline_stage  is distinct from old.pipeline_stage
  or new.owner_staff_id  is distinct from old.owner_staff_id
  or new.membership_type is distinct from old.membership_type
  or new.application_alias is distinct from old.application_alias
  or new.application_alias_status is distinct from old.application_alias_status
  or new.client_stage is distinct from old.client_stage
  or new.entry_stage is distinct from old.entry_stage
  or new.entry_stage_at is distinct from old.entry_stage_at then
    raise exception 'families: stage, owner, membership and the application alias can only be changed by staff';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
