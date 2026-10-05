-- Addendum 84 (5 Oct 2026): search rounds -- a placed child can look again.
--
-- Heather's meeting: "re-application logic: placed families can become live
-- again for new applications, preserving placement history."
--
-- Each child has their own search. Round 1 is everything that happened
-- before this addendum (it is implicit, no row). "Start new round" adds a
-- row here for that child. From then on:
--   * the child counts as placed only by an offer accepted in the current
--     round (or a start date saved after the round began), so the old
--     placement stays as history and the child is searching again;
--   * applications made from now on belong to the current round;
--   * schools the consultant did not carry over (dropped_school_ids) show as
--     closed for that child; everything else on the shortlist carries over;
--   * the family goes back to Live while any child is searching, and back to
--     Placed once every searching child has a new place.
-- Nothing is ever deleted. Safe to re-run. Needs addenda 12, 38 and 80.

create table if not exists public.search_rounds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  round_number int not null check (round_number >= 2),
  started_at timestamptz not null default now(),
  reason text,
  reason_note text,
  from_school_name text,
  dropped_school_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (child_id, round_number)
);
create index if not exists idx_search_rounds_family on public.search_rounds(family_id);

alter table public.search_rounds enable row level security;
drop policy if exists "staff read search rounds" on public.search_rounds;
create policy "staff read search rounds" on public.search_rounds for select using (public.is_staff());
drop policy if exists "staff add search rounds" on public.search_rounds;
create policy "staff add search rounds" on public.search_rounds for insert with check (public.is_staff());
drop policy if exists "staff edit search rounds" on public.search_rounds;
create policy "staff edit search rounds" on public.search_rounds for update using (public.is_staff()) with check (public.is_staff());
-- No delete policy: rounds are history.
drop policy if exists "family read own search rounds" on public.search_rounds;
create policy "family read own search rounds" on public.search_rounds
  for select using (family_id in (select id from public.families where account_user_id = auth.uid()));

-- Every application belongs to a round. New ones take the child's current round.
alter table public.applications
  add column if not exists round_number int not null default 1;

create or replace function public.applications_set_round_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.round_number := coalesce(
    (select max(r.round_number) from public.search_rounds r where r.child_id = new.child_id), 1);
  return new;
end;
$$;

drop trigger if exists applications_set_round_trg on public.applications;
create trigger applications_set_round_trg
  before insert on public.applications
  for each row execute function public.applications_set_round_trg_fn();

-- Stage is worked out per child, from the child's current round.
create or replace function public.compute_pipeline_stage(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_any_rounds boolean;
  v_child_placed boolean := false;
  v_searching boolean := false;
  v_placed boolean := false;
  v_has_offer boolean := false;
  v_has_application boolean := false;
  v_has_visit boolean := false;
  v_has_shortlist boolean := false;
  v_last_round timestamptz;
begin
  select exists (select 1 from public.search_rounds where family_id = p_family_id),
         (select max(started_at) from public.search_rounds where family_id = p_family_id)
  into v_any_rounds, v_last_round;

  with cur as (
    select c.id as child_id,
           coalesce(max(r.round_number), 1) as rn,
           max(r.started_at) as started
    from public.children c
    left join public.search_rounds r on r.child_id = c.id
    where c.family_id = p_family_id
    group by c.id
  ), per_child as (
    select cur.child_id, cur.rn,
           (
             exists (select 1 from public.applications a
                     where a.child_id = cur.child_id and a.round_number = cur.rn and a.status = 'offer_accepted')
             or exists (select 1 from public.family_placements p
                        where p.child_id = cur.child_id and (cur.started is null or p.created_at >= cur.started))
           ) as placed
    from cur
  )
  select coalesce(bool_or(placed), false),
         coalesce(bool_or(rn > 1 and not placed), false)
  into v_child_placed, v_searching
  from per_child;

  -- Offers / applications only count in each child's current round.
  select
    coalesce(bool_or(a.status in ('offer', 'offer_accepted')), false),
    coalesce(bool_or(a.status not in ('draft', 'withdrawn')), false)
  into v_has_offer, v_has_application
  from public.applications a
  join public.children c on c.id = a.child_id
  where c.family_id = p_family_id
    and a.round_number = coalesce(
      (select max(r.round_number) from public.search_rounds r where r.child_id = c.id), 1);

  v_placed := (
      v_child_placed
      or exists (select 1 from public.family_placements p
                 where p.family_id = p_family_id and p.child_id is null
                   and (v_last_round is null or p.created_at >= v_last_round))
      or (not v_any_rounds and exists (select 1 from public.families f
                                       where f.id = p_family_id and f.client_stage = 'placed'))
    ) and not v_searching;

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

-- A family that was Placed and has a child searching again goes back to Live.
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
  elsif exists (select 1 from public.search_rounds where family_id = p_family_id) then
    update public.families set client_stage = 'live'
    where id = p_family_id and client_stage = 'placed';
  end if;
end;
$$;

create or replace function public.search_rounds_advance_stage_trg_fn()
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

drop trigger if exists search_rounds_advance_stage_trg on public.search_rounds;
create trigger search_rounds_advance_stage_trg
  after insert or update or delete on public.search_rounds
  for each row execute function public.search_rounds_advance_stage_trg_fn();

notify pgrst, 'reload schema';
