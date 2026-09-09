-- ============================================================================
-- Addendum 11 — 2026-09-07: payments, from the client side
--
-- What this is for
-- ----------------
-- Addendum 9 made payments staff-only, which was backwards: a family should
-- see what they owe on their own dashboard, upload proof once they've paid
-- (bank transfer, same as today — this app never touches money directly),
-- and have that show up for founders to confirm. Same shape as documents:
-- family uploads, staff reviews.
--
-- New status: 'submitted' sits between 'unpaid' and 'paid' — the family says
-- they've paid and attached a receipt, but a founder hasn't confirmed it yet.
-- A family can only ever move a payment from 'unpaid' to 'submitted'; only
-- staff can mark something 'paid' or 'waived', or send a rejected submission
-- back to 'unpaid'.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendum 9 first — this narrows its constraint and
--   adds to its table.
-- ============================================================================

alter table public.payments add column if not exists receipt_path text;
alter table public.payments add column if not exists submitted_at timestamptz;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('unpaid', 'submitted', 'paid', 'waived'));

comment on column public.payments.status is
  'unpaid = still owed, nothing submitted; submitted = the family uploaded a receipt and says it''s paid, waiting on a founder to confirm; paid = a founder confirmed it; waived = HHE decided not to collect it. A family can only move a row from unpaid to submitted — everything else (confirming, rejecting back to unpaid, waiving) is staff-only, enforced by the trigger below, not just the app.';
comment on column public.payments.receipt_path is
  'Storage path in the documents bucket, e.g. {auth_user_id}/payment/{payment_id}/receipt-<timestamp>.<ext>. Reuses the existing documents bucket and its storage policies (owner_type isn''t hardcoded there) rather than adding a second bucket.';

-- ----------------------------------------------------------------------------
-- Client read + client update policies. Full staff access already exists
-- (payments_staff_all, addendum 9) and is untouched.
-- ----------------------------------------------------------------------------
drop policy if exists "payments_client_read" on public.payments;
create policy "payments_client_read" on public.payments
  for select
  using (family_id in (select id from public.families where account_user_id = auth.uid()));

-- RLS can only say WHICH rows a family may update, not which COLUMNS — that
-- part is the trigger below. This just lets a family attempt an update on
-- its own payment rows at all.
drop policy if exists "payments_client_submit" on public.payments;
create policy "payments_client_submit" on public.payments
  for update
  using (family_id in (select id from public.families where account_user_id = auth.uid()))
  with check (family_id in (select id from public.families where account_user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- The actual column-level lock. Staff bypass this entirely (is_staff() short-
-- circuits it) — this only ever fires for a family's own update.
-- ----------------------------------------------------------------------------
create or replace function public.payments_guard_client_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  if new.label       is distinct from old.label
  or new.amount       is distinct from old.amount
  or new.currency     is distinct from old.currency
  or new.due_date     is distinct from old.due_date
  or new.family_id    is distinct from old.family_id
  or new.notes        is distinct from old.notes
  or new.created_by   is distinct from old.created_by
  or new.paid_at      is distinct from old.paid_at then
    raise exception 'payments: a family can only attach a receipt and mark a payment submitted';
  end if;

  if new.status is distinct from old.status and (old.status <> 'unpaid' or new.status <> 'submitted') then
    raise exception 'payments: a family can only move a payment from unpaid to submitted';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_guard_client_edit_trg on public.payments;
create trigger payments_guard_client_edit_trg
  before update on public.payments
  for each row execute function public.payments_guard_client_edit();

notify pgrst, 'reload schema';
