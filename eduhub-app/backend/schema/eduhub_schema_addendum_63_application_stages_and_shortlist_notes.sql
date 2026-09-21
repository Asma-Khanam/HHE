-- ============================================================================
-- Addendum 63 -- 2026-09-21: new application stages + staff notes on the
-- school shortlist
--
-- What this is for (Heather's brief, 21 Sept 2026)
-- ------------------------------------------------
-- 1. Application stages become: Application submitted / Assessment booked /
--    Awaiting decision / Offer received (with the date a decision is needed
--    by) / Offer accepted / Waitlisted / Declined (with reason) / Withdrawn
--    (with reason).
--    The existing database keys are KEPT so nothing else has to change:
--      under_review -> shown as "Awaiting decision"
--      offer        -> shown as "Offer received"
--      rejected     -> shown as "Declined"
--    Only three keys are new: assessment_booked, offer_accepted, waitlisted.
--    documents_pending and reference_requested are retired: any application
--    still sitting in one of them is moved to 'submitted'.
-- 2. applications gets two columns: withdrawn_reason and offer_decision_by.
--    (rejected_reason, from addendum 52, is reused as the "Declined" reason.)
-- 3. shortlist_notes: a staff-only notes box per shortlisted school, separate
--    from the Feedback box. It is its OWN table, not a column on
--    school_shortlist, because families can read school_shortlist and these
--    notes (pasted school emails, availability, etc.) are internal.
-- 4. compute_pipeline_stage (addendum 48) learns the new statuses so a
--    family's pipeline stage still advances correctly.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file
--   -> Run. Safe to re-run.
-- ============================================================================

-- 1. Drop the old status CHECKs (looked up by content, so it works whatever
--    they happen to be named).
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.applications'::regclass, 'public.application_events'::regclass)
      and pg_get_constraintdef(oid) ilike '%under_review%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 2. Move anything on a retired status to 'submitted'.
update public.applications
set status = 'submitted'
where status in ('documents_pending', 'reference_requested');

update public.application_events
set new_status = 'submitted'
where new_status in ('documents_pending', 'reference_requested');

-- 3. Put the CHECKs back with the new list.
alter table public.applications
  add constraint applications_status_check
  check (status in (
    'draft', 'submitted', 'assessment_booked', 'under_review', 'offer',
    'offer_accepted', 'waitlisted', 'rejected', 'withdrawn'
  ));

alter table public.application_events
  add constraint application_events_new_status_check
  check (new_status is null or new_status in (
    'draft', 'submitted', 'assessment_booked', 'under_review', 'offer',
    'offer_accepted', 'waitlisted', 'rejected', 'withdrawn'
  ));

-- 4. The two new columns.
alter table public.applications add column if not exists withdrawn_reason text;
alter table public.applications add column if not exists offer_decision_by date;

comment on column public.applications.withdrawn_reason is
  'Why the application was withdrawn -- free text, entered when status is set to withdrawn. See addendum 63.';
comment on column public.applications.offer_decision_by is
  'When status = offer (shown as "Offer received"): the date the family has to respond by. See addendum 63.';

-- 5. Staff-only notes per shortlisted school.
create table if not exists public.shortlist_notes (
  shortlist_id uuid primary key references public.school_shortlist(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff(user_id) on delete set null
);

comment on table public.shortlist_notes is
  'Internal notes per shortlisted school (e.g. pasted emails from admissions about availability). Staff only -- families have no policy on this table. Separate from school_shortlist.feedback_text on purpose: families can read school_shortlist. See addendum 63.';

alter table public.shortlist_notes enable row level security;

drop policy if exists "shortlist_notes_staff_all" on public.shortlist_notes;
create policy "shortlist_notes_staff_all" on public.shortlist_notes
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- 6. Pipeline stage: teach compute_pipeline_stage the new statuses.
--    Same function as addendum 48, only the two status lists changed.
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
    bool_or(a.status in ('assessment_booked', 'under_review', 'offer', 'offer_accepted', 'waitlisted', 'rejected')),
    bool_or(a.status in ('offer', 'offer_accepted'))
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

-- Check: everything on the new list, and the retired ones gone.
select status, count(*) from public.applications group by status order by status;

notify pgrst, 'reload schema';
