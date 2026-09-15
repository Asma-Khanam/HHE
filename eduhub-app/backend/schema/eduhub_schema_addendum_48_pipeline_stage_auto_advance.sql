-- ============================================================================
-- Addendum 48 — 2026-09-15: pipeline stage auto-advances with real progress
--
-- What this is for
-- ----------------
-- Heather's WhatsApp request: "Can it auto update when we move through the
-- stages. It will be useful to see from the main dashboard." Pipeline stage
-- (Enquiry -> Profile -> Applied -> Assessed -> Offer -> Placed, addendum 3)
-- has always been a plain dropdown staff had to remember to move by hand —
-- easy to forget, and then the caseload dashboard shows a stage that's
-- stale compared to what's actually happened on the family's applications.
--
-- This adds a database-level "compute the real stage from the data, and
-- bump the family forward if it's ahead of what's recorded" step, so the
-- stage updates itself the moment the underlying signal changes, no matter
-- which app changed it:
--   Enquiry  -> Profile   when the family submits their intake form
--   Profile  -> Applied   when any child has an application that's past
--                         draft (actually sent to a school)
--   Applied  -> Assessed  when any application reaches reference_requested,
--                         under_review, offer or rejected
--   Assessed -> Offer     when any application reaches offer
--
-- Deliberately NOT automated: Placed. There's no signal anywhere in the
-- schema for "the family accepted an offer and is enrolling" (see
-- staffData.js's getSchoolDetail — stats.accepted is already null for the
-- same reason), so marking a family Placed stays a manual staff decision,
-- same as today. To keep this simple and safe, once a family is manually
-- marked Placed this never touches it again, and stage only ever moves
-- FORWARD automatically — a staff member who manually sets an earlier stage
-- for a correction is never overridden by a stage that hasn't changed
-- since (this only reacts to a NEW application status or a NEW intake
-- submission, not to every save).
--
-- Why this needs a database trigger rather than app code: intake_status
-- flips to 'submitted' from the FAMILY's own app (frontend/), and
-- application status changes happen from the STAFF app (founders/) — a
-- trigger is the only place that sees both regardless of which app made the
-- change, which is exactly "no matter where progress happens, the
-- dashboard reflects it" that was asked for.
--
-- families.pipeline_stage is locked to staff-only writes by
-- families_guard_client_edit (addendum 12) — a family's own session can't
-- write it directly. Our trigger's own write needs to get past that guard
-- even when it's firing off the back of the FAMILY's own intake-submit
-- update (where is_staff() is false), so families_guard_client_edit is
-- updated here to also allow a write when this migration's own
-- advance_pipeline_stage() sets a transaction-local flag first. This is the
-- only change to that function; everything else about the lock is
-- unchanged.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Needs addendum 2, 3 and 12 already applied. The backfill
--   at the end will bump any family whose applications/intake already
--   justify a later stage than what's currently on file — that's expected
--   and is exactly the "should already show this" fix.
-- ============================================================================

-- Let advance_pipeline_stage's own write through the staff-only guard, in
-- addition to the existing is_staff() check. Nothing else about the guard
-- changes.
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
  or new.application_alias_status is distinct from old.application_alias_status then
    raise exception 'families: pipeline_stage, owner_staff_id, membership_type and the application alias can only be changed by staff';
  end if;

  return new;
end;
$$;

-- What stage does this family's own data actually justify right now?
-- Read-only — never writes anything, just answers the question.
create or replace function public.compute_pipeline_stage(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_intake_status text;
  v_has_applied boolean;
  v_has_assessed boolean;
  v_has_offer boolean;
begin
  select intake_status into v_intake_status
  from public.families
  where id = p_family_id;

  select
    bool_or(a.status <> 'draft'),
    bool_or(a.status in ('reference_requested', 'under_review', 'offer', 'rejected')),
    bool_or(a.status = 'offer')
  into v_has_applied, v_has_assessed, v_has_offer
  from public.applications a
  join public.children c on c.id = a.child_id
  where c.family_id = p_family_id;

  if v_has_offer then
    return 'offer';
  elsif v_has_assessed then
    return 'assessed';
  elsif v_has_applied then
    return 'applied';
  elsif v_intake_status = 'submitted' then
    return 'profile';
  else
    return 'enquiry';
  end if;
end;
$$;

-- Bumps a family's pipeline_stage forward to whatever compute_pipeline_stage
-- says, but only forward, and never once a family is Placed. Safe to call
-- as often as you like -- a no-op if the family is already at or ahead of
-- what the data justifies.
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

-- Fires whenever an application is created or its status changes, from
-- either app -- re-evaluates that one family's stage.
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

-- Fires when a family's own intake_status changes (their own app submitting
-- the form) -- re-evaluates that family's stage.
create or replace function public.families_advance_stage_on_intake_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.intake_status is distinct from old.intake_status then
    perform public.advance_pipeline_stage(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists families_advance_stage_on_intake_trg on public.families;
create trigger families_advance_stage_on_intake_trg
  after update of intake_status on public.families
  for each row execute function public.families_advance_stage_on_intake_trg_fn();

-- Backfill: bring every existing family's stage up to date right away,
-- rather than waiting for the next application/intake change to touch it.
do $$
declare
  r record;
begin
  for r in select id from public.families loop
    perform public.advance_pipeline_stage(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
