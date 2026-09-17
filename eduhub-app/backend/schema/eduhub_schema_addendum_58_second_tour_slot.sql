-- ============================================================================
-- Addendum 58 -- a second tour slot per school (September 2026, Heather via
-- WhatsApp): "Add tours properly: Primary tour — date, time and Secondary
-- tour — date, time, as two separate slots on each school."
--
-- Deliberately additive rather than a rename/restructure: the existing
-- tour_date/tour_start_time/tour_end_time/tour_status/*_at columns (and
-- everything reading them -- the School visits panel, the school record
-- page, the Applications tab's "toured" note, the Dashboard's tour widget,
-- the family-facing Timetable) keep meaning exactly what they always have,
-- now labelled "Primary tour" in the UI. This just adds a second,
-- independent set of columns for a genuine second visit -- a school that
-- does an initial tour and a separate follow-up/assessment visit, say --
-- without touching any of the several places that already read the first
-- set. Same column shapes, same tour_status states, same
-- stamp-on-first-entry trigger pattern as addendum 38.
-- ============================================================================

alter table public.school_shortlist add column if not exists tour2_date date;
alter table public.school_shortlist add column if not exists tour2_start_time time;
alter table public.school_shortlist add column if not exists tour2_end_time time;
alter table public.school_shortlist add column if not exists tour2_status text
  check (tour2_status in ('offered', 'confirmed', 'completed', 'cancelled'));
alter table public.school_shortlist add column if not exists tour2_offered_at timestamptz;
alter table public.school_shortlist add column if not exists tour2_confirmed_at timestamptz;
alter table public.school_shortlist add column if not exists tour2_completed_at timestamptz;
alter table public.school_shortlist add column if not exists tour2_cancelled_at timestamptz;

comment on column public.school_shortlist.tour2_status is
  'The "Secondary tour" slot -- same states and meaning as tour_status (the Primary tour), just a second, independent booking. Most schools only ever use the first slot; this stays null until a second visit is actually booked.';

create or replace function public.school_shortlist_stamp_tour2_status()
returns trigger
language plpgsql
as $$
begin
  if new.tour2_status is distinct from old.tour2_status then
    if new.tour2_status = 'offered' and new.tour2_offered_at is null then
      new.tour2_offered_at := now();
    elsif new.tour2_status = 'confirmed' and new.tour2_confirmed_at is null then
      new.tour2_confirmed_at := now();
    elsif new.tour2_status = 'completed' and new.tour2_completed_at is null then
      new.tour2_completed_at := now();
    elsif new.tour2_status = 'cancelled' and new.tour2_cancelled_at is null then
      new.tour2_cancelled_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists school_shortlist_stamp_tour2_status_trg on public.school_shortlist;
create trigger school_shortlist_stamp_tour2_status_trg
  before update on public.school_shortlist
  for each row execute function public.school_shortlist_stamp_tour2_status();

notify pgrst, 'reload schema';
