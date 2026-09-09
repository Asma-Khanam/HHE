-- ============================================================================
-- Document storage setup — 2026-08-27
--
-- Creates a private Storage bucket for uploaded documents (passports, birth
-- certificates, school reports, etc — any PDF/PNG/JPEG) and locks it down so
-- each family can only see and manage its own files.
--
-- Storage path convention used by the app: {auth_user_id}/{owner_type}/{owner_id}/{document_type}.{ext}
-- e.g. 3f2a.../child/9c1b.../birth_certificate.pdf
-- The policy below checks that the FIRST folder in the path matches the
-- signed-in user's own id — the same pattern Supabase's own docs recommend
-- for per-user file storage.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_bucket_owner_all" on storage.objects;
create policy "documents_bucket_owner_all"
on storage.objects
for all
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
