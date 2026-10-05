-- Addendum 83 (5 Oct 2026): a placed family can apply again.
--
-- Heather's meeting: "re-application logic: placed families can become live
-- again for new applications, preserving placement history."
--
-- reapplication_since is stamped when a consultant presses "Start a new
-- application" on a placed family. From then on the family is worked out
-- as Placed again only when something NEW happens after that moment (an
-- offer accepted on an application created after it, or a new placement).
-- Nothing is deleted: the old placements and the old accepted application
-- stay exactly as they were, and the old school stays closed unless a
-- consultant keeps it open (addendum 81).
--
-- Safe to re-run. Needs addenda 12 and 80 already run.

alter table public.families
  add column if not exists reapplication_since timestamptz;

-- Only staff can start a re-application (same lock as the other staff columns).
create or replace function public.families_guard_client_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  if new.pipeline_stage  is distinct from old.pipeline_stage
  or new.owner_staff_id  is distinct from old.owner_staff_id
  or new.membership_type is distinct from old.membership_type
  or new.application_alias is distinct from old.application_alias
  or new.application_alias_status is distinct from old.application_alias_status
  or new.reapplication_since is distinct from old.reapplication_since then
    raise exception 'families: pipeline_stage, owner_staff_id, membership_type, the application alias and re-application can only be changed by staff';
  end if;

  return new;
end;
$$;

-- Placed now means: placed AFTER the latest re-application started (or ever,
-- if the family never re-applied).
create or replace function public.compute_pipeline_stage(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  v_placed boolean := false;
  v_has_offer boolean := false;
  v_has_application boolean := false;
  v_has_visit boolean := false;
  v_has_shortlist boolean := false;
begin
  select reapplication_since into v_since from public.families where id = p_family_id;

  select
    coalesce(bool_or(a.status = 'offer_accepted' and (v_since is null or a.created_at > v_since)), false),
    coalesce(bool_or(a.status in ('offer', 'offer_accepted') and (v_since is null or a.created_at > v_since)), false),
    coalesce(bool_or(a.status not in ('draft', 'withdrawn') and (v_since is null or a.created_at > v_since)), false)
  into v_placed, v_has_offer, v_has_application
  from public.applications a
  join public.children c on c.id = a.child_id
  where c.family_id = p_family_id;

  v_placed := v_placed
    or exists (
      select 1 from public.family_placements p
      where p.family_id = p_family_id and (v_since is null or p.created_at > v_since)
    )
    or (v_since is null and exists (select 1 from public.families f where f.id = p_family_id and f.client_stage = 'placed'));

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

notify pgrst, 'reload schema';
