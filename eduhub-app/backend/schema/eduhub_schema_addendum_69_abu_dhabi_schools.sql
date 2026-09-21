-- Addendum 69: starter set of established Abu Dhabi schools (Heather's tracker:
-- "Add Abu Dhabi schools to the list"). Name, area and curriculum only; admissions
-- contact, address and fees are for consultants to confirm with each school.
-- More can be added any time from Schools > + Add school.
-- Safe to re-run: skips any school already in the catalog by name.

insert into public.schools (name, area, curriculum, notes) values
  ('British School Al Khubairat', 'Al Bateen, Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Brighton College Abu Dhabi', 'Al Reem Island, Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Repton School Abu Dhabi', 'Al Reem Island, Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Cranleigh Abu Dhabi', 'Saadiyat Island, Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Yas International School', 'Yas Island, Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Raha International School', 'Khalifa City, Abu Dhabi', 'IB', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('American Community School of Abu Dhabi', 'Abu Dhabi', 'American', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.'),
  ('Nord Anglia International School Abu Dhabi', 'Abu Dhabi', 'British', 'Added Sept 2026 -- confirm admissions contact, address and fees directly with the school.')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
