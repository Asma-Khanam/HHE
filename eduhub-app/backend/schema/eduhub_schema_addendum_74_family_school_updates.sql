-- Addendum 74: "Update family" -- school progress updates the family sees (23 Sept 2026)
-- A consultant presses "Update family" on a school and picks what happened
-- (shortlisted, toured, application sent, no place, offer...). Each press is
-- one row here. The family's Dashboard reads these and draws a horizontal
-- timeline per school -- steps with no update yet stay grey.
-- Nothing is ever deleted: a wrong update is fixed by sending the right one.
-- Safe to re-run.

create table if not exists public.family_school_updates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  stage text not null check (stage in (
    'shortlisted', 'toured', 'applied', 'assessment',
    'offer', 'waitlisted', 'declined', 'no_place', 'placed'
  )),
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_family_school_updates_family on public.family_school_updates(family_id, created_at);

alter table public.family_school_updates enable row level security;

drop policy if exists "staff read family updates" on public.family_school_updates;
create policy "staff read family updates" on public.family_school_updates
  for select using (public.is_staff());

drop policy if exists "staff add family updates" on public.family_school_updates;
create policy "staff add family updates" on public.family_school_updates
  for insert with check (public.is_staff());

drop policy if exists "family reads own updates" on public.family_school_updates;
create policy "family reads own updates" on public.family_school_updates
  for select using (
    family_id in (select id from public.families where account_user_id = auth.uid())
  );

notify pgrst, 'reload schema';
