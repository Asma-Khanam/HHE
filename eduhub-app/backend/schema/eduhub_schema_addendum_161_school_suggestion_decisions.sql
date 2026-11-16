-- Addendum 161: Suggested schools -- Accept / Reject / Hold (Nov 2026)
-- The Suggested schools card on a family's School visits tab ranks schools
-- from what is already on the family record. This table remembers what the
-- consultant decided for each suggestion, so rejected schools stop coming
-- back, held ones stay parked, and the reason for a rejection is kept.
-- Staff only. Safe to run more than once.

create table if not exists public.school_suggestion_decisions (
  family_id uuid not null references public.families(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'rejected', 'held')),
  reason text,
  decided_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  primary key (family_id, school_id)
);

create index if not exists school_suggestion_decisions_school_idx
  on public.school_suggestion_decisions (school_id);

-- The database stamps who and when from the login, so a decision can't be
-- recorded under someone else's name.
create or replace function public.school_suggestion_decisions_stamp_fn()
returns trigger
language plpgsql
as $$
begin
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end;
$$;

drop trigger if exists school_suggestion_decisions_stamp_trg on public.school_suggestion_decisions;
create trigger school_suggestion_decisions_stamp_trg
  before insert or update on public.school_suggestion_decisions
  for each row execute function public.school_suggestion_decisions_stamp_fn();

alter table public.school_suggestion_decisions enable row level security;

drop policy if exists "school_suggestion_decisions_staff_all" on public.school_suggestion_decisions;
create policy "school_suggestion_decisions_staff_all" on public.school_suggestion_decisions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

comment on table public.school_suggestion_decisions is
  'What staff decided for each suggested school on a family (accepted, rejected with a reason, or held). Staff only. See addendum 161.';

notify pgrst, 'reload schema';
