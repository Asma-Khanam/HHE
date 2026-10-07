-- Addendum 94 (7 Oct 2026): application fees you can invoice, send to the family, and track.
--
-- Miss Lyndsay: "add into the application section ... (in between apply and
-- assessment) a section for application fees. We need to know when the fee was
-- paid, an upload button for the invoice and a button to send to the parent
-- dashboard for them to make the payment. We will add the payment links later."
--
-- On each fee (application_fees, addendum 60) this adds:
--   invoice_path / invoice_name  the uploaded invoice file (kept in the family's own
--                                folder of the private "documents" bucket, so the
--                                family can open it and no new storage rules are needed)
--   sent_to_family_at            when staff pressed "Send to family dashboard"
--   payment_url                  the payment link, to be added when it's ready
-- The family can now read ONLY fees that were sent to them (before, they could
-- read every fee on their applications, including ones the sync had pulled in
-- that nobody had chosen to share). Staff still see everything. Nothing is deleted.
-- Safe to re-run.

alter table public.application_fees
  add column if not exists invoice_path text,
  add column if not exists invoice_name text,
  add column if not exists sent_to_family_at timestamptz,
  add column if not exists payment_url text;

drop policy if exists "application_fees_family_read" on public.application_fees;
create policy "application_fees_family_read" on public.application_fees
  for select
  using (
    sent_to_family_at is not null
    and application_id in (
      select a.id from public.applications a
      join public.children c on c.id = a.child_id
      join public.families f on f.id = c.family_id
      where f.account_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
