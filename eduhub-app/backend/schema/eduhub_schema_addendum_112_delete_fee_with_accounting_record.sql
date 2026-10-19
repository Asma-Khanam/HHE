-- Addendum 112 (19 Oct 2026): a fee that is on an accounting record can be deleted.
--
-- Miss Lyndsay could not delete a wrong fee (Jad Bentley, Epsom College). The
-- fee was already on an accounting record, and the link from the record's child
-- line to the fee blocked the delete:
--   update or delete on table "application_fees" violates foreign key constraint
--   "accounting_record_items_application_fee_id_fkey"
--
-- What this does:
--   1. A fee on a record that is still OPEN (school paid, not invoiced) can now be
--      deleted. Its child line is marked removed, the log records it, and the
--      record is voided if that was its last child. Nothing on the record is erased.
--   2. A fee on a record that is already invoiced or paid cannot be deleted, and
--      the message says why, instead of a database error.
--   3. The child line keeps its amounts and history; its link to the deleted fee is
--      simply cleared.
-- Run after addendum 109. Safe to re-run.

-- 1. The link to the fee may be cleared when the fee is deleted.
alter table public.accounting_record_items alter column application_fee_id drop not null;
alter table public.accounting_record_items drop constraint if exists accounting_record_items_application_fee_id_fkey;
alter table public.accounting_record_items
  add constraint accounting_record_items_application_fee_id_fkey
  foreign key (application_fee_id) references public.application_fees(id) on delete set null;

-- 2. Before a fee is deleted, tidy up its accounting record.
create or replace function public.accounting_before_fee_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.accounting_record_items%rowtype;
  v_status text;
  v_family uuid;
  v_left int;
begin
  select * into v_item
  from public.accounting_record_items
  where application_fee_id = old.id and removed_at is null;

  if v_item.id is null then
    return old;
  end if;

  select status, family_id into v_status, v_family
  from public.accounting_records where id = v_item.record_id;

  if v_status <> 'open' then
    raise exception 'This fee is already on an % accounting record, so it cannot be deleted. Void the invoice first.', v_status;
  end if;

  update public.accounting_record_items set removed_at = now() where id = v_item.id;
  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (v_item.record_id, v_family, 'child_removed',
          jsonb_build_object('fee_id', old.id, 'reason', 'fee deleted', 'amount_paid', v_item.amount_paid),
          auth.uid());

  select count(*) into v_left
  from public.accounting_record_items where record_id = v_item.record_id and removed_at is null;
  if v_left = 0 then
    update public.accounting_records set status = 'void' where id = v_item.record_id;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_item.record_id, v_family, 'record_void', jsonb_build_object('reason', 'no children left'), auth.uid());
  end if;

  return old;
end;
$$;

drop trigger if exists accounting_before_fee_delete on public.application_fees;
create trigger accounting_before_fee_delete
  before delete on public.application_fees
  for each row execute function public.accounting_before_fee_delete();

notify pgrst, 'reload schema';
