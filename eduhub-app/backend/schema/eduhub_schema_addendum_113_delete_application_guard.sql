-- Addendum 113 (19 Oct 2026): deleting a school application is allowed, but not once money or a placement is attached.
--
-- Miss Lyndsay added schools to the wrong child (Bentley family) and needs to
-- delete those applications, not just withdraw them. Withdraw greys an
-- application out and keeps its history. Delete removes it completely, with its
-- timeline, checklist, fees and calendar dates, as if it was never added.
--
-- The app only shows the button. This is the rule that actually protects the
-- money, so it holds whoever or whatever tries to delete. A delete is refused
-- when:
--   1. the offer on it has been accepted (it is tied to the child's placement),
--   2. any fee on it is marked paid, or
--   3. any fee on it is on an accounting record that is already invoiced or paid
--      (void the invoice first).
-- A fee on a record that is still open (school paid, not invoiced) is fine: the
-- fee delete rule from addendum 112 tidies that record up.
-- Run after addenda 109 and 112. Safe to re-run.

create or replace function public.applications_before_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'offer_accepted' then
    raise exception 'This school has an accepted offer, so it cannot be deleted. Use Withdraw instead.';
  end if;

  if exists (
    select 1 from public.application_fees f
    where f.application_id = old.id and f.status = 'paid'
  ) then
    raise exception 'A fee on this application is marked paid, so it cannot be deleted. Use Withdraw instead.';
  end if;

  if exists (
    select 1
    from public.accounting_record_items i
    join public.application_fees f on f.id = i.application_fee_id
    join public.accounting_records r on r.id = i.record_id
    where f.application_id = old.id and i.removed_at is null and r.status <> 'open'
  ) then
    raise exception 'A fee on this application is on an invoiced accounting record, so it cannot be deleted. Void the invoice first.';
  end if;

  return old;
end;
$$;

drop trigger if exists applications_before_delete_guard on public.applications;
create trigger applications_before_delete_guard
  before delete on public.applications
  for each row execute function public.applications_before_delete_guard();

notify pgrst, 'reload schema';
