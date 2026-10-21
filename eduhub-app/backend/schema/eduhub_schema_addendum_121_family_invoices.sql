-- Addendum 121 (21 Oct 2026): what a family sees of the Stripe invoices HHE sends them.
--
-- The Billing page on the Client website needs, for each invoice: what it is for
-- (kind, school, children), the amount the family is charged, the due date, the
-- status, and the Stripe pay / receipt links. It must never see what HHE paid the
-- school. parent_invoices already holds only the charged amount, but the school and
-- children names live on tables a family cannot read, so this adds a view for
-- families (same pattern as addendum 110):
--
--   family_invoices          one row per live Stripe invoice for the signed-in family
--   family_application_fees  re-stated so a fee that is already on a live invoice is
--                            not listed twice (once as a fee, once as an invoice)
--
-- Void invoices are never returned. Safe to re-run. Run after addendum 116.

-- 1. The family's invoices ----------------------------------------------------------
create or replace view public.family_invoices
with (security_barrier = true)
as
select
  pi.id,
  pi.record_id,
  r.kind,
  pi.amount,
  pi.currency,
  pi.status,
  pi.due_date,
  pi.paid_at,
  pi.hosted_invoice_url,
  pi.invoice_pdf_url,
  pi.created_at,
  s.name as school_name,
  (
    select string_agg(coalesce(nullif(c.preferred_name, ''), nullif(c.first_name, ''), c.full_name), ', ' order by c.full_name)
    from public.accounting_record_items i
    join public.children c on c.id = i.child_id
    where i.record_id = r.id and i.removed_at is null
  ) as children
from public.parent_invoices pi
join public.accounting_records r on r.id = pi.record_id
left join public.schools s on s.id = r.school_id
join public.families fam on fam.id = pi.family_id
where pi.status in ('open', 'paid', 'needs_review')
  and fam.account_user_id = auth.uid();

revoke all on public.family_invoices from public, anon;
grant select on public.family_invoices to authenticated;

comment on view public.family_invoices is
  'Stripe invoices a family may see: what they are charged, never what HHE paid the school. Addendum 121.';

-- 2. Application fees: skip a fee that is already on a live invoice ---------------
create or replace view public.family_application_fees
with (security_barrier = true)
as
select
  f.id,
  f.application_id,
  f.label,
  case
    when f.hhe_paid_school_on_behalf and not f.paid_direct_by_family then
      coalesce(
        i.amount_charged,
        (select s.flat_fee_per_child from public.accounting_settings s where s.id)
      )
    else f.amount
  end as amount,
  f.currency,
  f.due_date,
  f.status,
  f.paid_at,
  case when f.hhe_paid_school_on_behalf and not f.paid_direct_by_family then null else f.invoice_path end as invoice_path,
  case when f.hhe_paid_school_on_behalf and not f.paid_direct_by_family then null else f.invoice_name end as invoice_name,
  f.payment_url,
  f.paid_direct_by_family,
  f.hhe_paid_school_on_behalf,
  f.sent_to_family_at,
  f.source,
  f.external_invoice_ref,
  f.created_at
from public.application_fees f
join public.applications a on a.id = f.application_id
join public.children c on c.id = a.child_id
join public.families fam on fam.id = c.family_id
left join public.accounting_record_items i
  on i.application_fee_id = f.id and i.removed_at is null
where f.sent_to_family_at is not null
  and fam.account_user_id = auth.uid()
  and not exists (
    select 1
    from public.accounting_record_items ri
    join public.parent_invoices pi on pi.record_id = ri.record_id and pi.status in ('open', 'paid', 'needs_review')
    where ri.application_fee_id = f.id and ri.removed_at is null
  );

revoke all on public.family_application_fees from public, anon;
grant select on public.family_application_fees to authenticated;

notify pgrst, 'reload schema';
