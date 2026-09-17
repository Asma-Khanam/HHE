-- ============================================================================
-- Addendum 56 -- adds the established American-curriculum schools in Dubai
-- to the school catalog (September 2026, Heather via WhatsApp): "add
-- American schools to the school list: American School of Dubai, Dubai
-- American Academy, Dunecrest, Universal American School, plus the other
-- US-curriculum ones in Dubai."
--
-- Same approach as addendum 40 (the original British/IB catalog seed):
-- established, well-known schools only, cross-checked across independent
-- public school-guide listings (current as of September 2026) rather than
-- every result a search turns up. Only name, area and curriculum are
-- filled in -- admissions contact, address, fees and document requirements
-- are left for staff to confirm directly with each school via its own Edit
-- form, same honest-limit reasoning as addendum 40.
--
-- Safe to re-run: relies on the same schools.name unique constraint
-- addendum 40 adds, and only inserts schools not already in the catalog by
-- name.
--
-- Four of the schools researched here (Universal American School, Dunecrest
-- American School, Collegiate International School, GEMS Al Khaleej
-- International School) are already in the catalog from addendum 40/41,
-- tagged 'IB' or 'American & IB' rather than plain 'American' -- their rows
-- are listed below too so this file is a complete record of the research,
-- but ON CONFLICT DO NOTHING means they're silently skipped, leaving the
-- existing rows (and any edits staff have since made to them) untouched.
-- Only 'American School of Dubai' and 'GEMS Dubai American Academy' -- the
-- two Heather actually named that weren't already in the catalog -- plus
-- the other established American-curriculum schools below are genuinely
-- new inserts.
-- ============================================================================

insert into public.schools (name, area, curriculum, notes) values
  ('American School of Dubai', 'Al Barsha', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Dubai American Academy', 'Al Barsha', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dunecrest American School', 'Wadi Al Safa 3', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Universal American School', 'Dubai Festival City', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Collegiate International School', 'Umm Suqeim', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Clarion School', 'Al Quoz', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Mirdif American School', 'Al Mizhar', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Al Khaleej International School', 'Al Warqa', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Next Generation School', 'Al Barsha', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('American Academy for Girls', 'Al Mizhar', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Al Mawakeb School - Al Barsha', 'Al Barsha', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Ignite School', 'Al Warqa', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Bright Learners Private School', 'Al Rashidiya', 'American', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
