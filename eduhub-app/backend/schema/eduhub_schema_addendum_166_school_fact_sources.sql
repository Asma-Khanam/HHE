-- Addendum 166: where each school fact came from (Nov 2026)
-- Agreed in the 19/11/2026 meeting: school suggestions may only rely on
-- independent, verified sources, namely the school's own website and KHDA
-- inspection reports. This table records, for each fact that Suggested
-- schools uses, which of those two it came from, the exact page, who
-- checked it and when.
--
--   fact          : fees | location | curriculum | year_groups | inclusion | subjects
--   source        : school_website | khda
--   checked_value : the fact as it was when it was checked. If the fact is
--                   changed later, the site shows "changed since checked"
--                   and stops using it until someone confirms the source again.
--
-- The KHDA rating itself is not in here: its report link (addendum 165) is
-- its source. Staff only. Needs addendum 165. Safe to run more than once.

create table if not exists public.school_fact_sources (
  school_id uuid not null references public.schools(id) on delete cascade,
  fact text not null check (fact in ('fees', 'location', 'curriculum', 'year_groups', 'inclusion', 'subjects')),
  source text not null check (source in ('school_website', 'khda')),
  source_url text not null check (source_url ~* '^https?://'),
  checked_value text,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id) on delete set null,
  primary key (school_id, fact)
);

-- The database stamps who checked it and when, so the stamp can't be typed in.
create or replace function public.stamp_school_fact_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.checked_at := now();
  new.checked_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_stamp_school_fact_source on public.school_fact_sources;
create trigger trg_stamp_school_fact_source
  before insert or update on public.school_fact_sources
  for each row execute function public.stamp_school_fact_source();

alter table public.school_fact_sources enable row level security;

drop policy if exists "staff all school fact sources" on public.school_fact_sources;
create policy "staff all school fact sources" on public.school_fact_sources
  for all using (public.is_staff()) with check (public.is_staff());

comment on table public.school_fact_sources is
  'Where each school fact used by Suggested schools came from (school website or KHDA report), with the page link and who checked it. See addendum 166.';

notify pgrst, 'reload schema';
