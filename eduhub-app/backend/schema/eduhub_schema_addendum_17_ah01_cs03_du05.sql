-- Addendum 17 (2026-09-07) — from Heather's "Questionnaire Change Request
-- v1.4": AH-01 (parent name split), CS-03 (new reason-for-leaving options
-- with a detail box), and DU-05 (Transfer Certificate understanding).

-- AH-01: parents.full_name stays the real, required column everything else
-- reads — first_name/last_name are just the two boxes the family now types
-- into, kept in sync with full_name by the frontend. Existing parents get a
-- one-time best-guess split (first word = first name, the rest = last name)
-- the next time their record loads in the form, same approach already used
-- for children.
alter table public.parents
  add column if not exists first_name text,
  add column if not exists last_name text;

-- CS-03: the optional "Please tell us a little more" box, shown only when
-- the family picks one of the two reasons that call for it (or types their
-- own reason under "Other").
alter table public.current_schools
  add column if not exists reason_for_leaving_details text;

-- DU-05: whether the family understands the Transfer Certificate and
-- attestation process — kept separate from has_transfer_certificate (which
-- is about whether they already HAVE the document).
alter table public.children
  add column if not exists transfer_certificate_understanding text;
