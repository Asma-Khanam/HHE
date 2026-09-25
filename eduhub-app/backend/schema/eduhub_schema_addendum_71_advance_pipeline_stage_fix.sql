-- Addendum 71: addendum 48 (auto-advance) was never run on this database, so the
-- shortlist trigger added in addendum 70 failed with
-- "function public.advance_pipeline_stage(uuid) does not exist".
-- This creates that function (using the new stage order) and the applications trigger.
-- Safe to re-run. Needs addenda 68 and 70 already run.

create or replace function public.advance_pipeline_stage(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_computed text;
  v_order text[] := array['enquiry', 'profile', 'applied', 'assessed', 'offer', 'placed'];
begin
  select pipeline_stage into v_current from public.families where id = p_family_id;

  if v_current is null or v_current = 'placed' then
    return;
  end if;

  v_computed := public.compute_pipeline_stage(p_family_id);

  if array_position(v_order, v_computed) > array_position(v_order, v_current) then
    perform set_config('app.bypass_client_guard', 'true', true);
    update public.families set pipeline_stage = v_computed where id = p_family_id;
  end if;
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
  select family_id into v_family_id
  from public.children
  where id = coalesce(new.child_id, old.child_id);

  if v_family_id is not null then
    perform public.advance_pipeline_stage(v_family_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists applications_advance_stage_trg on public.applications;
create trigger applications_advance_stage_trg
  after insert or update of status on public.applications
  for each row execute function public.applications_advance_stage_trg_fn();

-- Bring every family up to date now.
do $$
declare r record;
begin
  for r in select id from public.families loop
    perform public.advance_pipeline_stage(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
