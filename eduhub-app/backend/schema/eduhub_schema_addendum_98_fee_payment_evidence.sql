-- Addendum 98 (9 Oct 2026): on each application fee, two more file slots so
-- staff can keep both pieces of proof against the fee.
--
-- Heather (WhatsApp, 9 Oct 2026): "with the application fee section can we
-- have 2 upload sections. One for evidence that we have paid the school from
-- our bank, and evidence of the receipt of payment from the school."
--
-- On each fee (application_fees, addendum 60/94) this adds:
--   payment_proof_path / _name   HHE's own bank evidence that the fee was paid to the school
--   school_receipt_path / _name  the receipt the school sent back confirming payment
--
-- Both files sit in the same private "documents" bucket folder that
-- addendum 94's invoice uses: families/{family_id}/application_fee/{fee_id}/...
-- Staff see and write; the family does NOT see these two files (unlike the
-- invoice, which was deliberately shared via sent_to_family_at). We don't
-- widen the family's row-level policy, and no bucket policies change.
-- Nothing is deleted. Safe to re-run.

alter table public.application_fees
  add column if not exists payment_proof_path text,
  add column if not exists payment_proof_name text,
  add column if not exists school_receipt_path text,
  add column if not exists school_receipt_name text;

notify pgrst, 'reload schema';
