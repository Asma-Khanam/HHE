-- Addendum 104 (12 Oct 2026): keep HHE's own fee evidence staff-only.
--
-- Addendum 95 let a family download anything under families/{their family id}/
-- in the private documents bucket, so the invoice they are meant to see opens.
-- The bank payment proof ("payment-proof-...") and school receipt
-- ("school-receipt-...") for a fee are saved in that same folder (addendum 98,
-- "staff only"), so a family that asked the database for the file path could
-- have downloaded them. This narrows the family policy: same folder, but not
-- files named payment-proof-* or school-receipt-*. Invoices are unchanged.
-- Staff access is a different policy and is not touched. Safe to re-run.

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
);
