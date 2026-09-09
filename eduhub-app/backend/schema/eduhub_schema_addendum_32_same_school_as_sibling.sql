-- ============================================================================
-- Addendum 32 — 2026-09-09: NAV-02, "attends the same school as a sibling"
--
-- What this is for
-- ----------------
-- "From child two onwards, add a tick box above the current school
-- section... Once a sibling is chosen, copy that child's current school
-- details across, then collapse the section with an option to expand and
-- edit... If the sibling's school details are later edited, do not
-- silently change the child who copied them — leave the copy in place."
--
-- This is a ONE-TIME COPY, not a live link — the app copies the sibling's
-- current_schools fields across once, at the moment the box is ticked, and
-- never re-reads them after that. This one nullable column just remembers
-- WHICH sibling was chosen, so that:
--   1. reopening the application later can restore the ticked checkbox and
--      the collapsed "using so-and-so's details" summary, and
--   2. that summary can show the sibling's CURRENT name (families are
--      entering three and four children, and names can be edited later),
--      even though the copied school fields themselves stay frozen.
--
--   same_as_sibling_child_id   uuid  — the sibling child's id, or null if
--                                       this child's school was entered
--                                       independently (the normal case).
--
-- References children(id) with ON DELETE SET NULL: if that sibling is ever
-- removed from the family, this just reverts to a normal, independent,
-- already-filled-in school section rather than pointing at nothing.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.current_schools
  add column if not exists same_as_sibling_child_id uuid references public.children(id) on delete set null;

comment on column public.current_schools.same_as_sibling_child_id is
  'NAV-02 (September 2026 change request): which sibling (children.id) this school record was copied from, if any. A one-time copy, not a live link — editing the sibling''s own school never changes this row. Null once the family clears the "same school as a sibling" tick box.';

notify pgrst, 'reload schema';
