-- ============================================================================
-- Addendum 119 — 20 Oct 2026: three money types on the accounting record
-- (application fee, registration deposit, package)
--
-- Founders, 20 Oct 2026:
--   Heather: HHE pays the school's APPLICATION FEE for families who can't pay
--     from a UK account, and claims it back. The flat 600/child (addendum 109)
--     is the charge for this — the 600 is the application fee only.
--   Heather: HHE also sometimes pays the first-term REGISTRATION DEPOSIT on
--     acceptance — a variable amount — and invoices the family to repay it at
--     cost (no 600 on top). The school sometimes refunds it to HHE if the
--     application does not go ahead.
--   Lyndsay: the third kind is the PACKAGE — HHE's consultancy fee, one price
--     per family, paid in full / deposit then balance / installments.
--
-- This generalises the accounting record so all three live on the Accounting
-- page:
--   * accounting_records.kind                which of the three it is
--   * a registration deposit reuses the "we paid the school, family repays"
--     record and items, but charged = paid (no flat fee) and it can be refunded
--   * a package record carries a payment schedule (one row = pay in full)
--
-- The existing application-fee flow is untouched: kind defaults to
-- 'application_fee' and the flat-fee trigger from addendum 109 keeps its exact
-- behaviour (it now only ever looks at application-fee records, which is what it
-- always dealt with). Staff-only throughout. Safe to re-run. Run after 118.
-- ============================================================================

-- 1. kind on the record --------------------------------------------------------
alter table public.accounting_records
  add column if not exists kind text not null default 'application_fee';

update public.accounting_records set kind = 'application_fee' where kind is null;

alter table public.accounting_records drop constraint if exists accounting_records_kind_check;
alter table public.accounting_records
  add constraint accounting_records_kind_check
  check (kind in ('application_fee', 'registration_deposit', 'package'));

-- 2. a school gives a deposit back: 'refunded' is a new end state --------------
alter table public.accounting_records drop constraint if exists accounting_records_status_check;
alter table public.accounting_records
  add constraint accounting_records_status_check
  check (status in ('open', 'invoiced', 'paid', 'void', 'refunded'));

-- 3. one open record per family + school + KIND --------------------------------
-- Was (family, school); without kind an open deposit and an open application-fee
-- record for the same school would clash. Packages (no school) get their own
-- one-open rule below.
drop index if exists idx_accounting_records_one_open;
create unique index if not exists idx_accounting_records_one_open
  on public.accounting_records(family_id, school_id, kind) where status = 'open';
create unique index if not exists idx_accounting_records_one_open_package
  on public.accounting_records(family_id) where kind = 'package' and status = 'open';

-- 4. a deposit item has no application_fee row behind it -----------------------
alter table public.accounting_record_items alter column application_fee_id drop not null;

-- 5. package payment schedule --------------------------------------------------
-- One row = pay in full. Two = deposit then balance. Many = installments.
create table if not exists public.accounting_package_schedule (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.accounting_records(id) on delete restrict,
  seq int not null default 1,
  label text,
  amount numeric(10,2) not null check (amount >= 0),
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'invoiced', 'paid', 'void')),
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_package_schedule_record on public.accounting_package_schedule(record_id);

alter table public.accounting_package_schedule enable row level security;
drop policy if exists "package_schedule_staff_all" on public.accounting_package_schedule;
create policy "package_schedule_staff_all" on public.accounting_package_schedule
  for all using (public.is_staff()) with check (public.is_staff());

-- 6. open a registration-deposit record ---------------------------------------
-- p_items: [{ "child_id": uuid|null, "amount": number }]  (amount = what HHE
-- paid the school and will claim back at cost).
create or replace function public.add_registration_deposit(p_family uuid, p_school uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record uuid;
  v_item jsonb;
  v_child uuid;
  v_amount numeric(10,2);
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if p_family is null then raise exception 'A family is required.'; end if;

  insert into public.accounting_records (family_id, school_id, kind, currency, created_by)
  values (p_family, p_school, 'registration_deposit', 'AED', auth.uid())
  returning id into v_record;

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (v_record, p_family, 'record_opened', jsonb_build_object('kind', 'registration_deposit'), auth.uid());

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_child := nullif(v_item->>'child_id', '')::uuid;
    v_amount := (v_item->>'amount')::numeric;
    if v_amount is null or v_amount < 0 then raise exception 'Each deposit line needs an amount of 0 or more.'; end if;
    insert into public.accounting_record_items (record_id, application_fee_id, child_id, amount_paid, amount_charged)
    values (v_record, null, v_child, v_amount, v_amount);
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_record, p_family, 'child_added', jsonb_build_object('child_id', v_child, 'amount', v_amount), auth.uid());
  end loop;

  return v_record;
end;
$$;

-- 7. the school refunded a deposit, so the family is not charged ---------------
create or replace function public.mark_deposit_refunded(p_record uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_kind text;
  v_status text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select family_id, kind, status into v_family, v_kind, v_status
  from public.accounting_records where id = p_record;
  if v_family is null then raise exception 'Record not found.'; end if;
  if v_kind <> 'registration_deposit' then raise exception 'Only a registration deposit can be refunded by the school.'; end if;
  if v_status = 'paid' then raise exception 'The family already paid this deposit — handle the refund back to the family, not here.'; end if;
  if v_status not in ('open', 'void') then raise exception 'Void the deposit invoice first, then mark it refunded by the school.'; end if;

  update public.accounting_records set status = 'refunded', family_paid_at = null where id = p_record;
  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (p_record, v_family, 'deposit_refunded_by_school', jsonb_build_object('reason', p_reason), auth.uid());
end;
$$;

-- 8. open a package record with its payment schedule --------------------------
-- p_schedule: [{ "label": text|null, "amount": number, "due_date": date|null }]
create or replace function public.add_package_charge(p_family uuid, p_schedule jsonb, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record uuid;
  v_row jsonb;
  v_seq int := 0;
  v_amount numeric(10,2);
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if p_family is null then raise exception 'A family is required.'; end if;
  if coalesce(jsonb_array_length(p_schedule), 0) = 0 then raise exception 'A package needs at least one payment.'; end if;

  insert into public.accounting_records (family_id, school_id, kind, name, currency, created_by)
  values (p_family, null, 'package', p_name, 'AED', auth.uid())
  returning id into v_record;

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (v_record, p_family, 'record_opened', jsonb_build_object('kind', 'package', 'name', p_name), auth.uid());

  for v_row in select * from jsonb_array_elements(p_schedule) loop
    v_seq := v_seq + 1;
    v_amount := (v_row->>'amount')::numeric;
    if v_amount is null or v_amount < 0 then raise exception 'Each package payment needs an amount of 0 or more.'; end if;
    insert into public.accounting_package_schedule (record_id, seq, label, amount, due_date)
    values (v_record, v_seq, nullif(v_row->>'label', ''), v_amount, nullif(v_row->>'due_date', '')::date);
  end loop;

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (v_record, p_family, 'package_scheduled', jsonb_build_object('payments', v_seq), auth.uid());

  return v_record;
end;
$$;

grant execute on function public.add_registration_deposit(uuid, uuid, jsonb) to authenticated;
grant execute on function public.mark_deposit_refunded(uuid, text) to authenticated;
grant execute on function public.add_package_charge(uuid, jsonb, text) to authenticated;

-- 9. the application-fee trigger, re-stated so it only touches app-fee records -
-- Identical to addendum 109 apart from: the open-record lookup and the insert
-- are pinned to kind = 'application_fee', so a family's open deposit record is
-- never mistaken for its application-fee record.
create or replace function public.accounting_sync_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_child uuid;
  v_family uuid;
  v_item public.accounting_record_items%rowtype;
  v_record uuid;
  v_status text;
  v_flat numeric(10,2);
  v_left int;
begin
  select a.school_id, a.child_id, c.family_id
    into v_school, v_child, v_family
  from public.applications a
  join public.children c on c.id = a.child_id
  where a.id = new.application_id;

  if v_family is null then
    return new;
  end if;

  select * into v_item
  from public.accounting_record_items
  where application_fee_id = new.id and removed_at is null;

  if new.hhe_paid_school_on_behalf and not new.paid_direct_by_family then
    if v_item.id is null then
      -- Join the open application-fee record for this family and school, or open one.
      select id into v_record
      from public.accounting_records
      where family_id = v_family and school_id is not distinct from v_school and status = 'open' and kind = 'application_fee'
      limit 1;

      if v_record is null then
        insert into public.accounting_records (family_id, school_id, kind, currency, created_by)
        values (v_family, v_school, 'application_fee', coalesce(new.currency, 'AED'), auth.uid())
        returning id into v_record;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_record, v_family, 'record_opened', jsonb_build_object('fee_id', new.id), auth.uid());
      end if;

      select flat_fee_per_child into v_flat from public.accounting_settings where id;

      insert into public.accounting_record_items (record_id, application_fee_id, child_id, amount_paid, amount_charged)
      values (v_record, new.id, v_child, new.amount, coalesce(v_flat, 600));
      insert into public.accounting_events (record_id, family_id, kind, detail, actor)
      values (v_record, v_family, 'child_added',
              jsonb_build_object('fee_id', new.id, 'child_id', v_child, 'amount_paid', new.amount, 'amount_charged', coalesce(v_flat, 600)),
              auth.uid());
    else
      -- Already on a record: keep the amount paid in step while it is still open.
      select status into v_status from public.accounting_records where id = v_item.record_id;
      if v_status = 'open' and v_item.amount_paid is distinct from new.amount then
        update public.accounting_record_items set amount_paid = new.amount where id = v_item.id;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_item.record_id, v_family, 'amount_paid_changed',
                jsonb_build_object('fee_id', new.id, 'from', v_item.amount_paid, 'to', new.amount),
                auth.uid());
      end if;
    end if;

  elsif v_item.id is not null and new.status <> 'paid' then
    -- Moved away from "HHE paid the school" (and not simply settled by the family).
    select status into v_status from public.accounting_records where id = v_item.record_id;
    if v_status <> 'open' then
      raise exception 'This fee is already on an invoice. Void the invoice before changing who paid the school.';
    end if;

    update public.accounting_record_items set removed_at = now() where id = v_item.id;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_item.record_id, v_family, 'child_removed', jsonb_build_object('fee_id', new.id), auth.uid());

    select count(*) into v_left
    from public.accounting_record_items where record_id = v_item.record_id and removed_at is null;
    if v_left = 0 then
      update public.accounting_records set status = 'void' where id = v_item.record_id;
      insert into public.accounting_events (record_id, family_id, kind, detail, actor)
      values (v_item.record_id, v_family, 'record_void', jsonb_build_object('reason', 'no children left'), auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_sync_fee on public.application_fees;
create trigger accounting_sync_fee
  after insert or update of hhe_paid_school_on_behalf, paid_direct_by_family, amount, status
  on public.application_fees
  for each row execute function public.accounting_sync_fee();

notify pgrst, 'reload schema';
