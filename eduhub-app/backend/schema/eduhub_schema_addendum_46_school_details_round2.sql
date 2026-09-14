-- ============================================================================
-- Addendum 46 — 2026-09-14: finish the school details addendum 41 left
-- partially done
--
-- addendum 41 only set a field when the research at the time confirmed it,
-- and for ten schools that meant "website only" (or, for Dubai
-- International Academy - Al Barsha, nothing at all) -- not a bug, just
-- unfinished research. This addendum goes back and fills in the rest:
-- address, admissions contact, tour-booking and application links, sourced
-- from each school's own official site (or, where a site is blocked/broken,
-- the most reliable secondary directory available).
--
-- Two corrections folded in here:
--   - "Dubai English Speaking College"'s website was wrongly set to
--     desc.sch.ae in addendum 41 -- the real domain is dessc.sch.ae (DESS
--     and DESC are one joint institution, "Dubai English Speaking School
--     & College"). Fixed here; note its cert is currently expired, flagged
--     in the record's notes so staff aren't caught out clicking through.
--   - A few fields legitimately could not be confirmed (no admissions
--     email published for the three Kings' campuses beyond Kings Dubai,
--     no dedicated tour URL for Kent College or SISD's application form
--     link) -- left blank rather than guessed, same rule as addendum 41.
--
-- Safe to re-run: every UPDATE only touches a field that is currently NULL
-- or empty (the website_url fix for DESC is the one exception, since that
-- value was simply wrong, not blank).
-- ============================================================================

UPDATE public.schools
SET
  address = 'PO Box 38199, Dubai, UAE (Umm Suqeim Road, Al Barsha South)',
  admissions_contact_phone = '+971 4 356 6900'
WHERE name = 'Kings School Al Barsha'
  AND (address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '');

UPDATE public.schools
SET
  address = 'PO Box 38199, Dubai, UAE (Street 17, near Burj Al Arab, Umm Suqeim 3)',
  admissions_contact_email = 'info@kingsdubai.com',
  admissions_contact_phone = '+971 4 348 3939'
WHERE name = 'Kings School Dubai'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '');

UPDATE public.schools
SET
  address = 'PO Box 38199, Dubai, UAE',
  admissions_contact_phone = '+971 4 237 5555'
WHERE name = 'Kings School Nad Al Sheba'
  AND (address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '');

UPDATE public.schools
SET
  website_url = 'https://www.dessc.sch.ae/',
  address = 'PO Box 125814, Academic City, Dubai, UAE',
  admissions_contact_email = 'admissions@dess.sch.ae',
  admissions_contact_phone = '00971 (0)4 360 4866',
  tour_booking_url = 'https://dess.sch.ae/book-a-tour',
  application_url = 'https://dess.sch.ae/admissions/application-forms',
  notes = coalesce(notes || E'\n', '') || 'DESC shares an admissions team/booking system with Dubai English Speaking School (same group, addendum 46). dessc.sch.ae''s SSL certificate is currently expired -- browsers will warn on it; confirm directly with the school if that''s still the case when you need it.'
WHERE name = 'Dubai English Speaking College'
  AND (website_url = 'https://www.desc.sch.ae/' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  address = 'Al Barsha South, Dubai, UAE',
  admissions_contact_email = 'registrar@dubaiheightsacademy.com',
  admissions_contact_phone = '+971 4 356 3333',
  tour_booking_url = 'https://www.dubaiheightsacademy.com/admissions/book-a-tour',
  application_url = 'https://www.dubaiheightsacademy.com/admissions/application-forms'
WHERE name = 'Dubai Heights Academy'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  address = 'Al Abjar Street, Exit 15, Nad Al Sheba 2, Meydan South, Dubai, UAE',
  admissions_contact_phone = '+971 4 318 0700',
  application_url = 'https://www.kentcollege.sch.ae/application-form/'
WHERE name = 'Kent College Dubai'
  AND (address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  address = 'Al Barsha 3, Dubai, UAE',
  admissions_contact_email = 'communications@nasdubai.ae',
  admissions_contact_phone = '+971 4 219 9999',
  tour_booking_url = 'https://www.nordangliaeducation.com/nas-dubai/admissions/enquiry',
  application_url = 'https://nas-dubai.openapply.com/apply/forms/13886'
WHERE name = 'Nord Anglia International School Dubai'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  address = 'Khawaneej 1 - 47th Street, PO Box 112602, Dubai, UAE',
  admissions_contact_email = 'info@daralmarefa.ae',
  admissions_contact_phone = '+971 4 288 5782'
WHERE name = 'Dar Al Marefa'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '');

UPDATE public.schools
SET
  address = 'Al Barsha, Dubai, UAE, PO Box 118111',
  admissions_contact_email = 'admissions@diabarsha.com',
  admissions_contact_phone = '+971 4 524 4800',
  tour_booking_url = 'https://outlook.office365.com/book/DIABSchoolTours@innoventureseducation.com/',
  application_url = 'https://www.diabarsha.com/apply-dia-ab',
  notes = coalesce(notes || E'\n', '') || 'Regular tour slots per the school''s own site: Tuesdays and Thursdays, 8:00am (Secondary) and 9:30am (Primary).'
WHERE name = 'Dubai International Academy - Al Barsha'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  address = 'Dubai Healthcare City, Phase 2, Al Jaddaf, PO Box 505002, Dubai, UAE',
  admissions_contact_email = 'admissions@sisd.ae',
  admissions_contact_phone = '+971 4 375 0600',
  tour_booking_url = 'https://www.nordangliaeducation.com/sisd-dubai/book-a-tour'
WHERE name = 'Swiss International Scientific School Dubai'
  AND (address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '');

notify pgrst, 'reload schema';
