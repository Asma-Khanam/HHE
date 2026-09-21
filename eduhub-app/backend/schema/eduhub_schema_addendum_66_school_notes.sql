-- Addendum 66: school notes feed (add-only log on each school's Notes tab)
-- Safe to re-run. Staff only. Nothing can be deleted (no delete policy).

create table if not exists public.school_notes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists idx_school_notes_school on public.school_notes(school_id, created_at desc);

alter table public.school_notes enable row level security;

drop policy if exists "staff read school notes" on public.school_notes;
create policy "staff read school notes" on public.school_notes for select using (public.is_staff());
drop policy if exists "staff add school notes" on public.school_notes;
create policy "staff add school notes" on public.school_notes for insert with check (public.is_staff());
drop policy if exists "staff edit school notes" on public.school_notes;
create policy "staff edit school notes" on public.school_notes for update using (public.is_staff()) with check (public.is_staff());

notify pgrst, 'reload schema';
