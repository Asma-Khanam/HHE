-- Addendum 82 (5 Oct 2026): a general school phone number on the main school
-- record, separate from the admissions contacts.
alter table public.schools add column if not exists general_phone text;
notify pgrst, 'reload schema';
