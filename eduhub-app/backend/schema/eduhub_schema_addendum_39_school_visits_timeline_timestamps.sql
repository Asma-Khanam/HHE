-- ============================================================================
-- Addendum 39 -- two small timestamp columns needed for the "Timeline" strip
-- on the redesigned School visits panel (Enquiry sent / Replied / Tour
-- booked / Toured / Applied / Offer). Every other point on that timeline
-- already has a column (shortlisted_at, availability_replied_at,
-- tour_completed_at, applications.submitted_at) -- these are the two that
-- were still missing:
--
--   1. school_shortlist.tour_booked_at -- stamped the first time a tour_date
--      is actually set, regardless of what tour_status it starts at (a
--      tour can be entered straight as "confirmed" without ever passing
--      through "offered", so tour_offered_at alone isn't a reliable stand-in
--      for "when was a tour first booked").
--   2. applications.offer_at -- stamped the first time status enters
--      'offer', same "timestamp on first entry into a state" pattern used
--      everywhere else in this tracker.
--
-- Safe to re-run.
-- ============================================================================

alter table public.school_shortlist add column if not exists tour_booked_at timestamptz;

create or replace function public.school_shortlist_stamp_tour_booked()
returns trigger
language plpgsql
as $$
begin
  if new.tour_date is not null
     and (tg_op = 'INSERT' or old.tour_date is distinct from new.tour_date)
     and new.tour_booked_at is null then
    new.tour_booked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists school_shortlist_stamp_tour_booked_trg on public.school_shortlist;
create trigger school_shortlist_stamp_tour_booked_trg
  before insert or update on public.school_shortlist
  for each row execute function public.school_shortlist_stamp_tour_booked();

-- Backfill: rows that already have a tour_date from before this column
-- existed get a best-effort stamp (their offered/confirmed timestamp, or
-- shortlisted_at as a last resort) rather than sitting blank forever.
update public.school_shortlist
set tour_booked_at = coalesce(tour_offered_at, tour_confirmed_at, shortlisted_at)
where tour_date is not null and tour_booked_at is null;

alter table public.applications add column if not exists offer_at timestamptz;

create or replace function public.applications_stamp_offer()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'offer'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.offer_at is null then
    new.offer_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_stamp_offer_ins_trg on public.applications;
create trigger applications_stamp_offer_ins_trg
  before insert on public.applications
  for each row execute function public.applications_stamp_offer();

drop trigger if exists applications_stamp_offer_upd_trg on public.applications;
create trigger applications_stamp_offer_upd_trg
  before update on public.applications
  for each row execute function public.applications_stamp_offer();

-- Backfill existing offers.
update public.applications
set offer_at = coalesce(submitted_at, created_at)
where status = 'offer' and offer_at is null;
