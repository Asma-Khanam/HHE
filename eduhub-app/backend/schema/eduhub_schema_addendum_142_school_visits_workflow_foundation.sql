-- Addendum 142: School Visits Workflow -- parent blocked times + enquiry type
-- Stage 1 foundation for the School Visits workflow (21 Oct 2026 spec).

-- 1) Parent "unavailable times" inside the visit window.
create table if not exists public.family_blocked_times (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  blocks_date date not null,
  blocks_start time,
  blocks_end time,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint family_blocked_times_time_range check (
    (blocks_start is null and blocks_end is null)
    or (blocks_start is not null and blocks_end is not null and blocks_end > blocks_start)
  )
);
create index if not exists idx_family_blocked_times_family on public.family_blocked_times(family_id, blocks_date);

alter table public.family_blocked_times enable row level security;

drop policy if exists family_blocked_times_staff_read on public.family_blocked_times;
create policy family_blocked_times_staff_read on public.family_blocked_times
  for select to authenticated using (public.is_staff());
drop policy if exists family_blocked_times_staff_write on public.family_blocked_times;
create policy family_blocked_times_staff_write on public.family_blocked_times
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists family_blocked_times_family_read on public.family_blocked_times;
create policy family_blocked_times_family_read on public.family_blocked_times
  for select to authenticated using (
    exists (
      select 1 from public.families f
       where f.id = family_blocked_times.family_id
         and f.account_user_id = auth.uid()
    )
  );

-- 2) Which workflow this shortlist row is on.
alter table public.school_shortlist
  add column if not exists enquiry_type text
    check (enquiry_type in ('option_1', 'option_2'));

-- 3) Conflict helper.
create or replace function public.family_tour_conflict(
  p_family_id uuid,
  p_date date,
  p_start time,
  p_end time,
  p_ignore_shortlist uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_blocked_times b
     where b.family_id = p_family_id
       and b.blocks_date = p_date
       and (
         (b.blocks_start is null and b.blocks_end is null)
         or (p_start is not null and p_end is not null
             and b.blocks_start < p_end and b.blocks_end > p_start)
       )
  )
  or exists (
    select 1 from public.school_shortlist s
     where s.family_id = p_family_id
       and (p_ignore_shortlist is null or s.id <> p_ignore_shortlist)
       and (
         (s.tour_date = p_date and s.tour_start_time is not null and s.tour_end_time is not null
          and coalesce(s.tour_status,'offered') in ('offered','confirmed')
          and s.tour_start_time < p_end and s.tour_end_time > p_start)
         or
         (s.tour2_date = p_date and s.tour2_start_time is not null and s.tour2_end_time is not null
          and coalesce(s.tour2_status,'offered') in ('offered','confirmed')
          and s.tour2_start_time < p_end and s.tour2_end_time > p_start)
       )
  );
$$;
revoke all on function public.family_tour_conflict(uuid, date, time, time, uuid) from public, anon;
grant execute on function public.family_tour_conflict(uuid, date, time, time, uuid) to authenticated;

notify pgrst, 'reload schema';
