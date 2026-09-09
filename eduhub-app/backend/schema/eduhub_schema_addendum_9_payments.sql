-- ============================================================================
-- Addendum 9 — 2026-09-07: payments
--
-- What this is for
-- ----------------
-- There was no payments concept anywhere in the app. Founders need to track,
-- per family, what's owed — a registration fee, a deposit, a service fee —
-- with an amount and a due date, so the dashboard can show what's overdue
-- across the whole caseload, not just per family.
--
-- This is staff-only for now (no client visibility), matching the "Payments"
-- item on the dashboard rearrange note — nothing here has been asked to show
-- on the family's own dashboard.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendums 2 and 3 first — this uses the `staff`
--   table, is_staff(), and the `families` table they depend on.
-- ============================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  family_id uuid not null references public.families(id) on delete cascade,

  -- What this payment is, e.g. "Registration fee", "Deposit — Kings' College".
  label text not null check (length(btrim(label)) > 0),

  amount numeric(12, 2),
  currency text not null default 'AED',

  due_date date,
  paid_at timestamptz,

  -- 'overdue' is not auto-computed by a trigger on purpose — "is this late"
  -- depends on today's date, which changes without anyone touching the row.
  -- The app derives overdue from due_date < today AND status = 'unpaid' at
  -- render time, the same way it already does for tasks. This column is
  -- just the founder's own record of what actually happened (paid or not).
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'waived')),

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_family on public.payments(family_id, due_date);
create index if not exists idx_payments_due on public.payments(due_date) where status = 'unpaid';

comment on table public.payments is
  'Per-family payments HHE is tracking — fees, deposits, anything with an amount and a due date. Staff-only: no client-facing policy exists for this table.';
comment on column public.payments.status is
  'unpaid = still owed; paid = settled (paid_at should be set when this flips); waived = HHE decided not to collect it, e.g. for a legacy client. Whether an unpaid payment is "overdue" is computed from due_date at read time, not stored.';

alter table public.payments enable row level security;

drop policy if exists "payments_staff_all" on public.payments;
create policy "payments_staff_all" on public.payments
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- Authorship + updated_at, same pattern as calendar_events / case_notes.
-- ----------------------------------------------------------------------------
create or replace function public.payments_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.updated_at := now();
    -- Stamp paid_at the moment a payment is flipped to paid, if nobody set
    -- one explicitly — so "when did this get paid" is never left blank.
    if new.status = 'paid' and old.status <> 'paid' and new.paid_at is null then
      new.paid_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_author on public.payments;
create trigger payments_author
  before insert or update on public.payments
  for each row execute function public.payments_set_author();
