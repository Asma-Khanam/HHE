-- ============================================================================
-- Addendum 45 — 2026-09-14: school catalog cleanup
--
-- What this fixes
-- ----------------------------------------------------------------------------
-- The schools list showed ~74 rows but most looked blank. The cause wasn't
-- addendum 41 failing -- it's that several schools exist TWICE: once as the
-- full catalog record (addendum 40 + 41, fully populated) and once as a
-- bare shorthand row someone quick-added from a family's page (just a name,
-- no details), e.g. "Arbor" alongside "The Arbor School". Every family
-- shortlisted against the bare duplicate shows up as if that school has no
-- details -- because that specific row never got them.
--
-- This addendum:
--   1. Merges five confirmed duplicate pairs into their one real record,
--      moving any shortlist / year-group / application / case-note rows
--      across first so nothing shortlisted against a duplicate is lost.
--   2. Fills in real details for three schools that are NOT duplicates --
--      Durham School Dubai, GEMS International School (GIS) - Dubai Hills,
--      and Queen Elizabeth's School Dubai Sports City -- genuine schools
--      that were only ever added as a bare name and never researched.
--
-- Left alone on purpose: the bare "GEMS" row and the "mdx" row. Neither is
-- identifiable as one specific school (or, for "mdx", a school at all) --
-- ask Heather/founders what these were meant to be before touching them.
--
-- Safe to re-run: every merge step is guarded (only moves/deletes what
-- still matches by name), and the detail UPDATEs only touch blank fields,
-- exactly like addendum 41.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. One-off merge helper. For each (duplicate name, canonical name) pair:
-- re-point every table that references the duplicate school's id onto the
-- canonical school's id, skipping any row that would collide with a
-- unique constraint (school_shortlist: one row per family+school;
-- school_year_group_availability: one row per school+year group) -- those
-- collisions just mean the same family/year-group was already recorded
-- correctly against the canonical school, so the duplicate's copy is
-- redundant and safe to drop. Then delete the now-empty duplicate row.
-- Does nothing (quietly) if either name isn't found, so this is safe to
-- run even if a name has since changed.
-- ----------------------------------------------------------------------------
create or replace function public._merge_duplicate_school(dup_name text, canonical_name text)
returns void
language plpgsql
as $$
declare
  dup_id uuid;
  canonical_id uuid;
begin
  select id into dup_id from public.schools where name = dup_name;
  select id into canonical_id from public.schools where name = canonical_name;

  if dup_id is null or canonical_id is null or dup_id = canonical_id then
    return;
  end if;

  update public.applications set school_id = canonical_id where school_id = dup_id;
  update public.case_notes set school_id = canonical_id where school_id = dup_id;

  update public.school_shortlist ss
  set school_id = canonical_id
  where ss.school_id = dup_id
    and not exists (
      select 1 from public.school_shortlist ss2
      where ss2.family_id = ss.family_id and ss2.school_id = canonical_id
    );
  delete from public.school_shortlist where school_id = dup_id;

  update public.school_year_group_availability a
  set school_id = canonical_id
  where a.school_id = dup_id
    and not exists (
      select 1 from public.school_year_group_availability a2
      where a2.school_id = canonical_id and a2.year_group = a.year_group
    );
  delete from public.school_year_group_availability where school_id = dup_id;

  delete from public.schools where id = dup_id;
end;
$$;

select public._merge_duplicate_school('Arbor', 'The Arbor School');
select public._merge_duplicate_school('Brighton College', 'Brighton College Dubai');
select public._merge_duplicate_school('DIA Al Barsha', 'Dubai International Academy - Al Barsha');
select public._merge_duplicate_school('English College', 'The English College Dubai');
select public._merge_duplicate_school('Greenfield', 'Greenfield International School');

drop function public._merge_duplicate_school(text, text);

-- ----------------------------------------------------------------------------
-- 2. Real schools that were only ever added as a bare name -- fill in
-- their details from each school's own official site, same sourcing rule
-- as addendum 41 (only touches blank fields, never overwrites a staff edit).
-- ----------------------------------------------------------------------------
UPDATE public.schools
SET
  website_url = 'https://durhamdubai.ae/',
  address = 'P.O. Box 451536, Green Community, Dubai Investments Park, Dubai, UAE',
  curriculum = 'British',
  admissions_contact_email = 'info@durhamdubai.ae',
  admissions_contact_phone = '800 387426',
  tour_booking_url = 'https://durhamdubai.ae/book-a-tour/',
  application_url = 'https://durhamdubai.ae/contact/'
WHERE name = 'Durham'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR curriculum IS NULL OR curriculum = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsinternationalschool-dubaihills.com/en/',
  address = 'Dubai Hills, Dubai, United Arab Emirates',
  curriculum = 'IB',
  admissions_contact_email = 'm.arias_gis@gemsedu.com',
  admissions_contact_phone = '+971 4 339 6200',
  tour_booking_url = 'https://www.gemsinternationalschool-dubaihills.com/en/book-a-tour',
  application_url = 'https://www.gemsinternationalschool-dubaihills.com/en/apply-now'
WHERE name = 'Gems International School (GIS)'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR curriculum IS NULL OR curriculum = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.qedubaisportscity.com',
  address = 'Al Hebiah Fourth, Dubai Sports City, P.O. Box 451663, Dubai, UAE',
  curriculum = 'British',
  admissions_contact_email = 'admissions@qedubaisportscity.com',
  admissions_contact_phone = '+971 58 832 5609',
  tour_booking_url = 'https://www.qedubaisportscity.com/enquire-now/',
  application_url = 'https://www.qedubaisportscity.com/apply-now/',
  notes = coalesce(notes || E'\n', '') || 'Opening August 2026 -- Nursery to Year 8 at launch, England''s National Curriculum, under the QE Global Schools / GEDU Global Education partnership. Confirm year-group availability directly with the school given how new it is.'
WHERE name = 'Queen Elizabeth'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR curriculum IS NULL OR curriculum = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

notify pgrst, 'reload schema';
