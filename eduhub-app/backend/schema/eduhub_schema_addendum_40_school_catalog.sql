-- ============================================================================
-- Addendum 40 -- populates the school catalog with the established British
-- curriculum and IB schools in Dubai, so the shortlist "Add a school"
-- dropdown isn't starting from empty.
--
-- Source: public KHDA-rating school-comparison sites (school-guide listings
-- current as of September 2026), cross-checked across two independent
-- sources. Covers every "Outstanding" and "Very Good" KHDA-rated British
-- curriculum school, plus every established IB-curriculum school -- roughly
-- 60 schools. Newer/unrated schools and the "Good"/"Acceptable" tiers were
-- left out to keep this list to schools families actually ask about; add
-- more the normal way (the school-add form) as they come up.
--
-- HONEST LIMIT, on purpose: only name, area and curriculum are filled in.
-- Admissions contact name/email/phone, address, fees, and document
-- requirements are NOT populated here -- those need to come from each
-- school directly (a name or number pulled from a listicle is exactly the
-- kind of thing that goes stale or is simply wrong), so they're left for
-- staff to fill in via each school's own Edit form as they're confirmed.
-- The "notes" field says as much on every row, so nobody mistakes a blank
-- admissions contact for "we checked and there isn't one."
--
-- Safe to re-run: adds a unique constraint on schools.name (skipped if one
-- already exists, or if it fails because of a pre-existing duplicate --
-- resolve those first, then re-run), then inserts only schools not already
-- in the catalog by name. Never overwrites a row staff have already edited.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'schools_name_key'
  ) then
    begin
      alter table public.schools add constraint schools_name_key unique (name);
    exception when unique_violation then
      raise notice 'Skipped adding a unique constraint on schools.name -- there are already duplicate names in the table. Resolve those first, then re-run this file.';
    end;
  end if;
end $$;

insert into public.schools (name, area, curriculum, notes) values
  ('Dubai British School - Jumeirah Park', 'Jumeirah Park', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai British School - Emirates Hills', 'Emirates Hills', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai College', 'Al Safouh 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai English Speaking College', 'Academic City', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai English Speaking School', 'Oud Metha', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Jumeira Primary School', 'Al Safa 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Horizons English School', 'Jumeirah Beach Residence', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Jumeirah College', 'Al Safa 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Jumeirah English Speaking School - Arabian Ranches', 'Arabian Ranches', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Jumeirah English Speaking School', 'Al Safa 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Kings School Al Barsha', 'Al Barsha 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Kings School Dubai', 'Umm Suqeim 3', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Safa Community School', 'Al Barsha South', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Victory Heights Primary School', 'Dubai Sports City', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS New Millennium School', 'Al Khail', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Arcadia British School', 'Jumeirah Village Circle', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Brighton College Dubai', 'Al Barsha South', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai Heights Academy', 'Al Barsha South', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS First Point School', 'The Villa', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Founders School', 'Al Barsha South', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Royal Dubai School', 'Mirdif', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Hartland International School', 'Sobha Hartland', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Horizon International School', 'Umm Al Sheif', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Jebel Ali School', 'Jabal Ali 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Kent College Dubai', 'Nadd Al Shiba 2', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Kings School Nad Al Sheba', 'Nadd Al Shiba 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Raffles International School - Umm Suqeim South', 'Umm Suqeim 3', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Ranches Primary School', 'Arabian Ranches', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Regent International Private School', 'The Greens', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Repton Al Barsha', 'Al Barsha South', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Royal Grammar School Guildford Dubai', 'Tilal Al Ghaf', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Safa British School', 'Al Safa 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('The English College Dubai', 'Al Safa 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('The Winchester School - Jabal Ali', 'Jabal Ali 1', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Nord Anglia International School Dubai', 'Al Barsha 1', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Wellington International School', 'Al Sufouh', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Wellington Academy - Dubai Silicon Oasis', 'Dubai Silicon Oasis', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Wellington Academy - Al Khail', 'Bur Dubai', 'British', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Repton School Dubai', 'Nadd Al Shiba 3', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Sunmarke School', 'Jumeirah Village Circle', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Emirates International School Jumeirah', 'Umm Suqeim 1', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Deira International School', 'Dubai Festival City', 'British & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai International Academy - Emirates Hills', 'Emirates Hills', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dubai International Academy - Al Barsha', 'Al Barsha', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS World Academy Dubai', 'Al Barsha South', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('North London Collegiate School Dubai', 'Dubai', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Universal American School', 'Dubai Festival City', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dwight School Dubai', 'Al Barsha South', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Fairgreen International School', 'The Sustainable City', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Swiss International Scientific School Dubai', 'Al Jaddaf', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Uptown International School', 'Mirdif', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dunecrest American School', 'Wadi Al Safa 3, Dubailand', 'American & IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Modern Academy', 'Nad Al Sheba', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Collegiate International School', 'Umm Suqeim', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Jumeira Baccalaureate School', 'Jumeira 1', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Raffles World Academy', 'Umm Suqeim 3', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Emirates International School Meadows', 'The Meadows', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Greenfield International School', 'Dubai Investment Park', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Dar Al Marefa', 'Mirdif', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Ambassador International Academy', 'Al Khail Gate', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('GEMS Al Khaleej International School', 'Al Warqa 4', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Bloom World Academy Dubai', 'Al Barsha South', 'IB', 'Added from public curriculum listings, Sept 2026 -- confirm admissions contact, address and fees directly with the school.')
on conflict (name) do nothing;
