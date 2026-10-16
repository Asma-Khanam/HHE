-- Addendum 110 (16 Oct 2026): families see ONE figure for a fee HHE paid, never the school's.
--
-- Miss Lyndsay (16 Oct 2026): the family does not need to know whether the
-- amount is 525 or 600. What HHE paid the school (application_fees.amount)
-- must never reach a family, on the screen or through the database.
--
-- Row level security can hide rows but not one column of a row, and a family
-- could always read its own fee rows. So this adds a view for families that:
--   - for a fee HHE paid on the family's behalf, shows the amount the family
--     is charged (the flat fee) in the "amount" column, never the school's fee
--   - hides the school's own invoice file on those fees
--   - only returns fees that were sent to that family's dashboard
-- and stops the school's invoice file for those fees being downloadable.
--
-- PART 1 OF 2. This part is safe to run first: it only ADDS the view and
-- tightens file access, and the Client website keeps working. Push the Client
-- website change next, check the Billing page, then run part 2 (addendum 111),
-- which removes the family's direct read of the fee table.
-- Safe to re-run.

-- 1. The family-safe view ------------------------------------------------------
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
  and fam.account_user_id = auth.uid();

revoke all on public.family_application_fees from public, anon;
grant select on public.family_application_fees to authenticated;

comment on view public.family_application_fees is
  'What a family may see of its own application fees. For fees HHE paid on the family''s behalf, amount is what the family is charged, never what HHE paid the school, and the school''s own invoice is hidden. Addendum 110.';

-- 2. The school's invoice file on an HHE-paid fee is not downloadable by the family ---
-- A security definer helper, so the check still works once the family can no
-- longer read application_fees itself (a plain subquery would see nothing and
-- let every file through).
create or replace function public.is_hhe_paid_fee_file(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.application_fees f
    where f.invoice_path = p_path
      and f.hhe_paid_school_on_behalf
      and not f.paid_direct_by_family
  );
$$;

-- Same as addendum 104, plus: not the school's invoice on a fee HHE paid.
drop policy if exists "family_read_family_folder" on storage.objects;
create policy "family_read_family_folder"
on storage.objects
for select
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'families'
  and (storage.foldername(name))[2] in (
    select f.id::text from public.families f where f.account_user_id = auth.uid()
  )
  and storage.filename(name) !~ '^(payment-proof|school-receipt)-'
  and not public.is_hhe_paid_fee_file(name)
);

notify pgrst, 'reload schema';
