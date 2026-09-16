-- ============================================================================
-- Addendum 55 -- generic document uploads on a family's Overview and on a
-- school's own record (September 2026, Heather via WhatsApp): "Can we add
-- a document upload on the family overview please? I create a timetable
-- of visits for the family" and separately "Can we also have a document
-- upload available in the schools section so we can upload A Level/ GCSE
-- option booklets?"
--
-- The documents table already supports polymorphic owners (parent, child,
-- application) with staff-blanket read/write policies (addenda 2 and 35).
-- This just widens the owner_type list to also cover 'family' and
-- 'school', so the exact same upload/list/delete plumbing
-- (founders/src/lib/documents.js) can be reused instead of building a
-- second document system. No new columns -- document_type doubles as a
-- free-text label here (staff types their own label, e.g. "October 2026
-- tour schedule" or "RGS A-Level options booklet"), same pattern as every
-- other document_type value, just not drawn from a fixed checklist.
-- ============================================================================

alter table public.documents drop constraint if exists documents_owner_type_check;
alter table public.documents add constraint documents_owner_type_check
  check (owner_type in ('parent', 'child', 'application', 'family', 'school'));

-- Lets a family eventually see/manage their own family-level documents
-- (e.g. a tour schedule PDF) from their own dashboard, the same way they
-- already can for their own parent/child documents. Not used by the
-- founders app's upload today (that's staff-only, via is_staff()), but
-- there's no reason to block the family's own read/write access to a row
-- that's plainly theirs -- same reasoning as every other owner_type here.
-- 'school' is deliberately NOT added below: a school isn't owned by any
-- family, so those documents stay staff-only, via the existing blanket
-- staff_insert_documents/staff_delete_documents/staff_read_documents
-- policies (addenda 2 and 35) -- no family-side policy needed or wanted.
create or replace function public.user_owns_document(p_owner_type text, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_owner_type
    when 'parent' then exists (
      select 1 from public.parents p
      join public.families f on f.id = p.family_id
      where p.id = p_owner_id and f.account_user_id = auth.uid()
    )
    when 'child' then exists (
      select 1 from public.children c
      join public.families f on f.id = c.family_id
      where c.id = p_owner_id and f.account_user_id = auth.uid()
    )
    when 'application' then exists (
      select 1 from public.applications a
      join public.children c on c.id = a.child_id
      join public.families f on f.id = c.family_id
      where a.id = p_owner_id and f.account_user_id = auth.uid()
    )
    when 'family' then exists (
      select 1 from public.families f
      where f.id = p_owner_id and f.account_user_id = auth.uid()
    )
    else false
  end;
$$;

notify pgrst, 'reload schema';
