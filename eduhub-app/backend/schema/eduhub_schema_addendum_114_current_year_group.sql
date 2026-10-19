-- Addendum 114 (19 Oct 2026): each child's current year group.
--
-- Miss Lyndsay asked for the year a child is in now as well as the year they are
-- applying for. year_group_applying_for already exists; this adds the current
-- one, using the same list of year groups. Optional, so no existing form becomes
-- incomplete. Run before the Client website change goes live. Safe to re-run.

alter table public.children add column if not exists current_year_group text;

comment on column public.children.current_year_group is
  'The year group the child is in now, at their current school (same list as year_group_applying_for). Addendum 114.';

notify pgrst, 'reload schema';
