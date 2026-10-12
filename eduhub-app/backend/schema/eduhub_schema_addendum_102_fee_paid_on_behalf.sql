-- Addendum 102 (12 Oct 2026): mark a fee as paid by HHE on behalf of the
-- family (family then settles with HHE).
--
-- Miss Heather (list, 12 Oct 2026): "Need to add section about application
-- fee payments - should show paid/ not paid, who by and when it was paid
-- (if paid by us, needs to show up on top of dashboard with link to pay
-- and invoice generated)".
--
-- Separate from paid_direct_by_family (addendum 101, family paid the
-- school directly) and payment_proof_path (addendum 98, HHE's own bank
-- statement, staff-only path). This boolean is the family-visible signal
-- that HHE paid the school on behalf and the family owes HHE for it. Staff
-- tick it; the client website reads it to show the Owe HHE badge and the
-- top-of-dashboard callout.
--
-- Safe to re-run. Default false.

alter table public.application_fees
  add column if not exists hhe_paid_school_on_behalf boolean not null default false;

comment on column public.application_fees.hhe_paid_school_on_behalf is
  'True when HHE paid the school for this fee and the family now owes HHE. Staff tick this on the Application fee step. Family-readable so the Client website can show Paid by HHE on your behalf and surface the owed amount at the top of the parent dashboard.';

notify pgrst, 'reload schema';
