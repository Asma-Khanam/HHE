-- ============================================================================
-- Addendum 44 — 2026-09-14: three schools added, tour-schedule field, and
-- dropping latitude/longitude (WhatsApp requests from the founders)
--
-- What this is for
-- ----------------
-- 1. Adds Harrow International School Dubai and The Arbor School to the
--    catalog (neither was in addendum 40's list), and fills in the website
--    for Dubai British School - Jumeirah Park, which was already in the
--    catalog under that name — dubaibritishschooljumeira.ae is that same
--    school's own site, not a separate "DBS Jumeirah" campus, confirmed by
--    web search before writing this (Wikipedia + the school's own site both
--    identify dubaibritishschooljumeira.ae as Dubai British School,
--    Jumeirah Park). So this fills in that row rather than creating a
--    duplicate school.
--
-- 2. Adds schools.typical_tour_schedule — free text, same pattern as
--    documents_required from addendum 36, for "they tend to tour the same
--    day/time each week for certain year groups" as a reference on the
--    school record, separate from the per-family tour_date/tour_start_time
--    booked on school_shortlist (addendum 38) — this is the school's usual
--    pattern, not any one family's actual booked slot.
--
-- 3. Drops schools.latitude/longitude and the estimate_drive_minutes()
--    function from addendum 38. The founders don't want to maintain
--    coordinates on the school record, so the same-day tour clash-check
--    feature that depended on them (both the SQL function and the
--    findTourClashes()/estimateDriveMinutes() client-side logic in
--    founders/src/lib/staffData.js, and the clash banner/dots in
--    SchoolShortlistPanel.jsx) is removed as part of this same change —
--    those two columns were the only thing it read, so nothing else in the
--    schema depends on them.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Needs addendum 36, 38, 40, 41 already applied.
-- ============================================================================

insert into public.schools (name, area, curriculum, website_url, notes) values
  ('Harrow International School Dubai', 'Dubai South', 'British',
   'https://harrowdubai.ae/',
   'Added Sept 2026 per founders'' WhatsApp request. Opened by Taaleem, Dubai South — confirm admissions contact, address and fees directly with the school before relying on this record.'),
  ('The Arbor School', 'Al Furjan', 'British',
   'https://thearborschool.ae/',
   'Added Sept 2026 per founders'' WhatsApp request -- confirm admissions contact, address and fees directly with the school.')
on conflict (name) do nothing;

-- Covers the case where this addendum already ran once with Harrow's
-- website left null (its own URL wasn't confirmed yet at the time) —
-- fills it in now without touching a value staff may have already edited.
update public.schools
set website_url = 'https://harrowdubai.ae/'
where name = 'Harrow International School Dubai' and website_url is null;

update public.schools
set website_url = 'https://dubaibritishschooljumeira.ae/'
where name = 'Dubai British School - Jumeirah Park' and website_url is null;

alter table public.schools add column if not exists typical_tour_schedule text;

comment on column public.schools.typical_tour_schedule is
  'Free text — this school''s usual tour day(s)/time(s), often broken down by year group (e.g. "Reception: Tuesdays 10am; Year 1-6: Thursdays 9:30am"). This is the school''s general pattern for staff reference, not any one family''s actual booked tour — that''s school_shortlist.tour_date/tour_start_time (addendum 38).';

-- ----------------------------------------------------------------------------
-- Drop the clash-check's coordinate columns and the function that used
-- them. The client-side clash logic that read these two columns
-- (estimateDriveMinutes/findTourClashes in staffData.js, and the clash
-- banner/dots in SchoolShortlistPanel.jsx) is removed in the same commit as
-- this migration.
-- ----------------------------------------------------------------------------
drop function if exists public.estimate_drive_minutes(numeric, numeric, numeric, numeric);
alter table public.schools drop column if exists latitude;
alter table public.schools drop column if exists longitude;

notify pgrst, 'reload schema';
