-- ============================================================================
-- Addendum 12 — 2026-09-07: family can set origin/destination; staff-only
-- columns get a real lock
--
-- What this is for
-- ----------------
-- "Moving from" / "Destination" were staff-typed fields (CaseSettingsPanel)
-- even though it's the family who actually knows this — they should enter
-- it themselves on their own application, and founders should just see it.
--
-- Looking into that surfaced a real gap: the original families_owner_all
-- policy (eduhub_schema.sql) gives a family FULL read/write on their own
-- row, and the only column ever locked down since (families_protect_account,
-- addendum 3) is account_user_id. Nothing has ever stopped a family from
-- writing pipeline_stage, owner_staff_id or membership_type directly — the
-- app just never showed them a way to. That's a real gap (not just a UI
-- nicety) now that families write to this table from their own dashboard,
-- so this closes it properly: those three columns become staff-only at the
-- database level, the same pattern as payments_guard_client_edit (addendum
-- 11). origin/destination are deliberately NOT in the locked list — that's
-- exactly what a family should be able to set.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendum 2 first — this uses is_staff().
-- ============================================================================

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
  or new.application_alias_status is distinct from old.application_alias_status then
    raise exception 'families: pipeline_stage, owner_staff_id, membership_type and the application alias can only be changed by staff';
  end if;

  return new;
end;
$$;

drop trigger if exists families_guard_client_edit_trg on public.families;
create trigger families_guard_client_edit_trg
  before update on public.families
  for each row execute function public.families_guard_client_edit();

comment on column public.families.origin is
  'Where the family is moving from — set by the family on their own application (frontend ApplicationForm), shown read-only-in-spirit on the founders'' Case panel. Not staff-only: see families_guard_client_edit above for what actually is.';
comment on column public.families.destination is
  'Where the family is moving to — same as origin above: family-entered, founders just see it.';

notify pgrst, 'reload schema';
