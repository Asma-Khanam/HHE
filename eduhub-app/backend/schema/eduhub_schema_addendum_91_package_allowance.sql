-- Addendum 91 (7 Oct 2026): what each family's package includes, and what's been used.
--
-- Miss Lyndsay: "We want a system where the parents know when they have had the
-- number of tours and applications completed as part of their package."
--
-- The standard allowance for each package lives in the app (data/packages.js,
-- from the 2026 brochure). This table only holds a per-family OVERRIDE for the
-- odd family whose deal differs (extra tours bought, a re-placement, etc.).
-- Leave a number empty to use the package's own allowance.
-- Staff write it; the family can only read their own. Nothing is deleted.
-- Safe to re-run.

create table if not exists public.family_package_allowance (
  family_id uuid primary key references public.families(id) on delete cascade,
  tours_included int check (tours_included is null or tours_included >= 0),
  applications_included int check (applications_included is null or applications_included >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.family_package_allowance enable row level security;
drop policy if exists "staff read package allowance" on public.family_package_allowance;
create policy "staff read package allowance" on public.family_package_allowance for select using (public.is_staff());
drop policy if exists "staff add package allowance" on public.family_package_allowance;
create policy "staff add package allowance" on public.family_package_allowance for insert with check (public.is_staff());
drop policy if exists "staff edit package allowance" on public.family_package_allowance;
create policy "staff edit package allowance" on public.family_package_allowance for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "family read own package allowance" on public.family_package_allowance;
create policy "family read own package allowance" on public.family_package_allowance
  for select using (family_id in (select id from public.families where account_user_id = auth.uid()));
-- No delete policy.

notify pgrst, 'reload schema';
