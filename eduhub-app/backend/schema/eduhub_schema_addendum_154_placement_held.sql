-- 154: "Placed - held". A family can accept a place (e.g. Brighton College)
-- but keep applying elsewhere. A held placement is still "Offer accepted"
-- on the application, but it does NOT make the child placed: the family stays
-- Live and the other schools stay open. "Confirmed" (placement_hold = false)
-- behaves exactly as before.

alter table public.applications
  add column if not exists placement_hold boolean not null default false;

-- Stage is worked out per child; a held acceptance does not count as placed.
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
                     where a.child_id = cur.child_id and a.round_number = cur.rn and a.status = 'offer_accepted' and not a.placement_hold)
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

-- A family whose placement is only held goes back to (or stays) Live.
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
  elsif exists (select 1 from public.search_rounds where family_id = p_family_id)
     or exists (select 1 from public.applications a join public.children c on c.id = a.child_id
                where c.family_id = p_family_id and a.placement_hold) then
    update public.families set client_stage = 'live'
    where id = p_family_id and client_stage = 'placed';
  end if;
end;
$$;

-- Re-work the family's stage when the hold is switched on or off.
drop trigger if exists applications_advance_stage_trg on public.applications;
create trigger applications_advance_stage_trg
  after insert or update of status, placement_hold or delete on public.applications
  for each row execute function public.applications_advance_stage_trg_fn();

notify pgrst, 'reload schema';
