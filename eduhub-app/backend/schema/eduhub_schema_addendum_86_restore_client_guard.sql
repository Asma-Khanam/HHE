-- Addendum 86 (5 Oct 2026): put the family edit guard back the way it was.
--
-- The stopgap in addendum 83 replaced families_guard_client_edit without the
-- "app.bypass_client_guard" exception, so when a family saved something (e.g.
-- "Your view" on a school) the automatic stage update was blocked with
-- "families: pipeline_stage, owner_staff_id ... can only be changed by staff".
-- This is addendum 68's version again. Search rounds (84) don't need the
-- reapplication_since column; it is simply left unused.
-- Safe to re-run.

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
