-- Addendum 120: when the family pays HHE back by hand, the accounting record closes.
--
-- On the Caseload fee box, "Family paid HHE" (settled) marked the fee paid, but the
-- Accounting side kept showing the child as still owing, because the fee trigger
-- only looked at who paid the school. Now:
--   * a fee set to settled closes its open record as paid once every child on it is
--     settled (a record that already has a Stripe invoice is left to Stripe)
--   * moving the fee off settled again re-opens a record that was closed by hand
--     (never one that Stripe marked paid)
-- Also closes the records that are already in this state. Safe to run twice.

create or replace function public.accounting_reopen_if_manual(p_record uuid, p_family uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.accounting_records where id = p_record;
  if v_status = 'paid'
     and not exists (select 1 from public.parent_invoices where record_id = p_record and status = 'paid') then
    update public.accounting_records set status = 'open', family_paid_at = null where id = p_record;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (p_record, p_family, 'record_reopened', jsonb_build_object('reason', 'fee is no longer settled'), auth.uid());
    return 'open';
  end if;
  return v_status;
end;
$$;

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

  if new.status = 'paid' and not new.paid_direct_by_family then
    -- Settled: the family has paid HHE. Close the record once every child on it is settled.
    if v_item.id is not null then
      select status into v_status from public.accounting_records where id = v_item.record_id;
      if v_status = 'open'
         and not exists (
           select 1
           from public.accounting_record_items i
           join public.application_fees f on f.id = i.application_fee_id
           where i.record_id = v_item.record_id and i.removed_at is null
             and f.status <> 'paid' and f.id <> new.id
         ) then
        update public.accounting_records set status = 'paid', family_paid_at = now() where id = v_item.record_id;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_item.record_id, v_family, 'family_paid_manual', jsonb_build_object('fee_id', new.id), auth.uid());
      end if;
    end if;

  elsif new.hhe_paid_school_on_behalf and not new.paid_direct_by_family then
    if v_item.id is null then
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
      -- Back from settled: re-open a record that was only closed by hand.
      v_status := public.accounting_reopen_if_manual(v_item.record_id, v_family);
      if v_status = 'open' and v_item.amount_paid is distinct from new.amount then
        update public.accounting_record_items set amount_paid = new.amount where id = v_item.id;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_item.record_id, v_family, 'amount_paid_changed',
                jsonb_build_object('fee_id', new.id, 'from', v_item.amount_paid, 'to', new.amount),
                auth.uid());
      end if;
    end if;

  elsif v_item.id is not null and new.status <> 'paid' then
    -- Moved away from "HHE paid the school".
    v_status := public.accounting_reopen_if_manual(v_item.record_id, v_family);
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

-- One-off: close the open application-fee records whose children are all settled already.
with done as (
  select r.id, r.family_id
  from public.accounting_records r
  where r.status = 'open' and r.kind = 'application_fee'
    and exists (select 1 from public.accounting_record_items i where i.record_id = r.id and i.removed_at is null)
    and not exists (
      select 1
      from public.accounting_record_items i
      join public.application_fees f on f.id = i.application_fee_id
      where i.record_id = r.id and i.removed_at is null and f.status <> 'paid'
    )
), closed as (
  update public.accounting_records r
     set status = 'paid', family_paid_at = now()
    from done
   where r.id = done.id
  returning r.id, r.family_id
)
insert into public.accounting_events (record_id, family_id, kind, detail, actor)
select id, family_id, 'family_paid_manual', jsonb_build_object('reason', 'settled on the Caseload before this fix'), null
from closed;

notify pgrst, 'reload schema';
