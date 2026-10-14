-- Addendum 108 (14 Oct 2026): Asma, client Dashboard Placed tab -- a family
-- should see which school each child is placed at and the start date on
-- their own home screen. family_placements was staff-only until now (base
-- policies from addendum 70); this adds a read-only policy for the family
-- itself on their own rows, so the client Dashboard pipeline can show
-- "Place confirmed, starting <date>" without an RPC. Writes stay staff-only.
-- Safe to re-run.

drop policy if exists "family read own placements" on public.family_placements;
create policy "family read own placements" on public.family_placements
  for select
  using (
    family_id in (
      select id from public.families where account_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
