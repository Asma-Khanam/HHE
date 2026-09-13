-- ============================================================================
-- Addendum 35 — staff can upload, replace, and remove a family's documents,
-- not just view/download them (September 2026 change request: "they want
-- edit/upload option for documents as well").
--
-- Staff already had full read access to every document row and file
-- (addendum 2). This adds the write side, deliberately not scoped to any
-- particular family or folder — staff need to act on ANY family's
-- documents from the founders app, the same blanket access they already
-- have for reading. The documents_protect_file trigger (addendum 3) still
-- applies to everyone including staff: a document's file_url/owner_type/
-- owner_id/document_type can never be changed in place, only replaced via
-- delete-and-re-insert, same as the family's own app already does it.
-- ============================================================================

drop policy if exists "staff_insert_documents" on public.documents;
create policy "staff_insert_documents" on public.documents
  for insert
  with check (public.is_staff());

drop policy if exists "staff_delete_documents" on public.documents;
create policy "staff_delete_documents" on public.documents
  for delete
  using (public.is_staff());

-- Storage: staff can write into ANY folder in the documents bucket, not
-- just their own (the existing per-user policy in setup_documents_storage.sql
-- only ever matches the uploader's own auth.uid()). Uploads from the
-- founders app are still written under the FAMILY's own account_user_id
-- folder (see founders/src/lib/documents.js), so this is what makes that
-- possible — without it, staff writing into a family's folder would fail
-- exactly the way a stranger's would.
drop policy if exists "staff_write_documents_bucket" on storage.objects;
create policy "staff_write_documents_bucket"
on storage.objects
for insert
with check (bucket_id = 'documents' and public.is_staff());

drop policy if exists "staff_update_documents_bucket" on storage.objects;
create policy "staff_update_documents_bucket"
on storage.objects
for update
using (bucket_id = 'documents' and public.is_staff())
with check (bucket_id = 'documents' and public.is_staff());

drop policy if exists "staff_delete_documents_bucket" on storage.objects;
create policy "staff_delete_documents_bucket"
on storage.objects
for delete
using (bucket_id = 'documents' and public.is_staff());

notify pgrst, 'reload schema';
