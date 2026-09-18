-- ============================================================================
-- Addendum 60 -- foundation for the real Applications tab (September 2026,
-- Asma/Heather): a timestamped event log and a fees table per application,
-- plus tagging which schools run on OpenApply, so a school-portal sync can
-- write into the exact same tables a staff member would write into by hand.
--
-- Why two new tables instead of just more columns on `applications`:
-- `applications.status` (base schema) already tracks the CURRENT stage, but
-- nothing records WHEN it changed, or the individual facts along the way
-- (an assessment got booked, a fee was invoiced, a fee got paid) -- and the
-- founders' own reference mockup for this page is explicit that "days in
-- stage", "expiring in N days" and the Stage Timeline are all DERIVED from
-- timestamps, "never typed by hand". One row per event/fee is what makes
-- that possible; a handful of nullable columns on `applications` couldn't
-- hold more than the single most recent fact.
--
-- `source` on both tables (and `schools.application_platform`) exist so a
-- future OpenApply sync job and a staff member typing an update both write
-- into the same place, and the UI can label which is which -- "synced from
-- OpenApply" vs "logged by Heather" -- rather than staff having to guess
-- whether a row is trustworthy.
--
-- HOW TO RUN:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--   Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- application_events -- one row per stage change / assessment / note, so the
-- Stage Timeline and "days in stage" are computed from real timestamps.
-- ----------------------------------------------------------------------------
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'status_change', 'assessment_booked', 'assessment_completed',
      'document_requested', 'document_received', 'fee_invoiced', 'fee_paid', 'note'
    )),
  -- Set only on event_type = 'status_change' -- the applications.status value
  -- this event moved the application TO. Lets the timeline reconstruct "days
  -- in stage" without re-deriving it from applications.status alone (which
  -- only ever holds the current value, not history).
  new_status text
    check (new_status is null or new_status in (
      'draft', 'submitted', 'documents_pending', 'reference_requested',
      'under_review', 'offer', 'rejected', 'withdrawn'
    )),
  description text not null,
  occurred_at timestamptz not null default now(),
  -- 'staff' for anything typed in through the app, 'openapply_sync' for
  -- whatever the scraper writes on its own -- see addendum notes above.
  source text not null default 'staff' check (source in ('staff', 'openapply_sync')),
  created_by uuid references public.staff(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_application_events_application on public.application_events(application_id, occurred_at desc);

comment on table public.application_events is
  'Timestamped log of everything that happens to one application -- stage changes, assessments, documents, fees, staff notes. The Applications tab''s Stage Timeline and "days in stage"/"expiring" figures are derived from this, not typed by hand. See addendum 60.';
comment on column public.application_events.source is
  '''staff'' for anything logged through the app by a person, ''openapply_sync'' for whatever a school-portal sync job writes on its own. Shown in the UI so staff can tell at a glance which is which.';

-- ----------------------------------------------------------------------------
-- application_fees -- one row per invoice/fee (application fee, deposit,
-- tuition deposit, ...), so Invoices & Fees on a school's own portal has
-- somewhere to land on our side.
-- ----------------------------------------------------------------------------
create table if not exists public.application_fees (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  label text not null, -- e.g. "Application fee", "Deposit"
  amount numeric(10,2),
  currency text not null default 'AED',
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'waived')),
  paid_at timestamptz,
  source text not null default 'staff' check (source in ('staff', 'openapply_sync')),
  -- The school portal's own invoice number/ref (e.g. "Invoice-1288"), so a
  -- re-run of the sync updates the same row instead of creating a duplicate
  -- every time it checks. Null for a fee staff typed in by hand.
  external_invoice_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_application_fees_external_ref
  on public.application_fees(application_id, external_invoice_ref)
  where external_invoice_ref is not null;
create index if not exists idx_application_fees_application on public.application_fees(application_id);

comment on table public.application_fees is
  'One row per invoice/fee on an application (application fee, deposit, ...). external_invoice_ref lets a school-portal sync upsert the same row on every check instead of duplicating it. See addendum 60.';

create or replace function public.set_application_fees_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_application_fees_updated_at on public.application_fees;
create trigger trg_application_fees_updated_at
  before update on public.application_fees
  for each row execute function public.set_application_fees_updated_at();

-- ----------------------------------------------------------------------------
-- Which portal platform a school's application system runs on, so a future
-- sync job knows which schools to even attempt. Null/'other' means: no
-- automated sync, staff log updates by hand (Track A on its own already
-- covers every school regardless of this field).
-- ----------------------------------------------------------------------------
alter table public.schools add column if not exists application_platform text
  check (application_platform is null or application_platform in ('openapply', 'other'));

comment on column public.schools.application_platform is
  '''openapply'' marks a school as eligible for the automated portal sync (logs in with the family''s own application_alias/application_password, addendum 43). Null or ''other'' means updates are staff-logged only.';

-- ----------------------------------------------------------------------------
-- RLS -- staff full access (same is_staff() pattern as the rest of the
-- schema); families get read-only access to their OWN applications' events
-- and fees, matching applications_owner_all's join, but never write access
-- -- these are a factual log, not something a family edits.
-- ----------------------------------------------------------------------------
alter table public.application_events enable row level security;
alter table public.application_fees enable row level security;

drop policy if exists "application_events_staff_all" on public.application_events;
create policy "application_events_staff_all" on public.application_events
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "application_events_family_read" on public.application_events;
create policy "application_events_family_read" on public.application_events
  for select
  using (application_id in (
    select a.id from public.applications a
    join public.children c on c.id = a.child_id
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ));

drop policy if exists "application_fees_staff_all" on public.application_fees;
create policy "application_fees_staff_all" on public.application_fees
  for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "application_fees_family_read" on public.application_fees;
create policy "application_fees_family_read" on public.application_fees
  for select
  using (application_id in (
    select a.id from public.applications a
    join public.children c on c.id = a.child_id
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
