-- Addendum 101 (12 Oct 2026): mark a fee as paid directly by the family
-- (not through HHE's bank).
--
-- Miss Lyndsay (list, 12 Oct 2026): "application fees being paid directly
-- by family tick box". Today the fee flow assumes HHE pays the school and
-- the family then settles with HHE. For schools that let the family pay
-- the school straight, this tick records that so the dashboard, invoices
-- and bank-evidence requirements can adapt.
--
-- Safe to re-run. Default false (paid through HHE).

alter table public.application_fees
  add column if not exists paid_direct_by_family boolean not null default false;

comment on column public.application_fees.paid_direct_by_family is
  'True when the family pays the school directly, not through HHE. Staff tick this on the Application fee step. When true, the We paid the school bank evidence slot is hidden and the family sees Paid directly to the school.';

notify pgrst, 'reload schema';
