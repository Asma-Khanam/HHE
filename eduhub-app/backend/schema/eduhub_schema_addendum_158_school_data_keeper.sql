-- 158: School data keeper.
-- Claude reads each school's own website and suggests fixes for the school
-- record (phone, admissions email, fees / tour / application links, address,
-- fees, curriculum). Nothing changes on a school until a consultant clicks
-- Apply. Staff only. Safe to re-run.

create table if not exists public.school_data_checks (
  school_id uuid primary key references public.schools(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'no_website', 'unreadable', 'error')),
  note text,
  pages_read integer not null default 0
);

create table if not exists public.school_update_suggestions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  field text not null,
  current_value text,
  suggested_value text not null,
  source_url text,
  evidence text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_school_update_suggestions_school on public.school_update_suggestions (school_id, status);

alter table public.school_data_checks enable row level security;
alter table public.school_update_suggestions enable row level security;

drop policy if exists "staff all school data checks" on public.school_data_checks;
create policy "staff all school data checks" on public.school_data_checks
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff all school update suggestions" on public.school_update_suggestions;
create policy "staff all school update suggestions" on public.school_update_suggestions
  for all using (public.is_staff()) with check (public.is_staff());

notify pgrst, 'reload schema';
