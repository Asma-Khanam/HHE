-- Addendum 96 (8 Oct 2026): one application per child per school.
-- Duplicate applications (same child, same school) kept appearing. This makes the
-- database refuse a second one. The founders app hands back the existing application
-- instead of showing an error. Run AFTER the duplicates were cleaned up.
create unique index if not exists idx_applications_one_per_child_school
  on public.applications(child_id, school_id);
notify pgrst, 'reload schema';
