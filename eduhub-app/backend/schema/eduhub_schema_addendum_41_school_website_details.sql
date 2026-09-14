-- Addendum 41: School website details (address, admissions contact, tour/application links, website URL)
-- Populates real, officially-sourced details for the schools added in addendum 40, pulled directly
-- from each school's own official website (not third-party directories) by manual research, Sept 2026.
-- Only fields with a confirmed value are set; anything the research could not confirm is left untouched
-- (existing NULLs stay NULL) so staff know it still needs a manual check.
--
-- Safe to re-run: every UPDATE only touches a field that is currently NULL or empty, so it will never
-- clobber a value a staff member has since entered by hand.

alter table public.schools
  add column if not exists website_url text;

comment on column public.schools.website_url is 'Official school website URL (added Sept 2026, addendum 41).';

UPDATE public.schools
SET
  website_url = 'https://www.dubaibritishschooljp.ae',
  address = 'Al Warood St 1, Jumeirah Park, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions@dubaibritishschooljp.ae',
  admissions_contact_phone = '+971 (0)4 552 0247',
  tour_booking_url = 'https://dbsjp.openapply.com/events/new?only=tours',
  application_url = 'https://dbsjp.openapply.com/apply/forms/52370'
WHERE name = 'Dubai British School - Jumeirah Park'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.dubaibritishschool.ae',
  address = 'PO Box 37828, Springs 3, Emirates Hills, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions@dubaibritishschool.ae',
  admissions_contact_phone = '+971 (0)4 361 9361',
  application_url = 'https://www.dubaibritishschool.ae/admissions/'
WHERE name = 'Dubai British School - Emirates Hills'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.dubaicollege.org/',
  address = 'PO Box 837, Dubai, United Arab Emirates',
  admissions_contact_phone = '+971 4 3999111',
  tour_booking_url = 'https://www.dubaicollege.org/admissions/visiting-dubai-college',
  application_url = 'https://www.dubaicollege.org/admissions'
WHERE name = 'Dubai College'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.desc.sch.ae/'
WHERE name = 'Dubai English Speaking College'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://dess.sch.ae/',
  address = 'Oud Metha Road, Dubai, UAE',
  admissions_contact_phone = '00971 (0)4 337 1457',
  tour_booking_url = 'https://dess.sch.ae/book-a-tour',
  application_url = 'https://dess.sch.ae/admissions/application-forms'
WHERE name = 'Dubai English Speaking School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.jumeirahprimaryschool.com/',
  address = 'Al Safa 1, Dubai, United Arab Emirates',
  admissions_contact_email = 'info_jps@gemsedu.com',
  admissions_contact_phone = '+971-4-394-3500',
  tour_booking_url = 'https://www.jumeirahprimaryschool.com/Admissions/School-Tours',
  application_url = 'https://www.jumeirahprimaryschool.com/Admissions/Enrol-Online'
WHERE name = 'GEMS Jumeira Primary School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://horizonschooldubai.com/',
  admissions_contact_phone = '+971 4 342 2891',
  tour_booking_url = 'https://horizonschooldubai.com/school-tours/',
  application_url = 'https://horizonschooldubai.com/apply/'
WHERE name = 'Horizons English School'
  AND (website_url IS NULL OR website_url = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsjc.com/',
  address = 'Al Wasl Road, Dubai, UAE',
  admissions_contact_phone = '+971 4 395 5524',
  tour_booking_url = 'https://www.gemsjc.com/Admissions/School-Tours',
  application_url = 'https://www.gemsjc.com/Admissions/Apply-Online'
WHERE name = 'Jumeirah College'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.jess.sch.ae/',
  admissions_contact_email = 'admissions@jess.sch.ae',
  admissions_contact_phone = '+971 (0)4 361 9019',
  application_url = 'https://www.jess.sch.ae/admissions-at-jess/'
WHERE name = 'Jumeirah English Speaking School - Arabian Ranches'
  AND (website_url IS NULL OR website_url = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.jess.sch.ae/',
  admissions_contact_email = 'admissions@jess.sch.ae',
  admissions_contact_phone = '+971 (0)4 361 9019',
  application_url = 'https://www.jess.sch.ae/admissions-at-jess/'
WHERE name = 'Jumeirah English Speaking School'
  AND (website_url IS NULL OR website_url = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://kings-edu.com/albarsha/'
WHERE name = 'Kings School Al Barsha'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://kings-edu.com/dubai/'
WHERE name = 'Kings School Dubai'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://safacommunityschool.com/',
  address = 'PO Box 71091, Al Barsha South, Sheikh Mohammed Bin Zayed Road (E311 Road), Dubai, UAE',
  admissions_contact_email = 'reception@safacommunityschool.com',
  admissions_contact_phone = '04 385 1810',
  tour_booking_url = 'https://safacommunityschool.com/school-visits-and-tours',
  application_url = 'https://safacommunityschool.com/enrol-online'
WHERE name = 'Safa Community School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.vhprimary.com/',
  address = 'PO Box 454959, Dubai, UAE',
  admissions_contact_phone = '+971 4 560 2000',
  tour_booking_url = 'https://www.vhprimary.com/admissions/book-a-tour',
  application_url = 'https://www.vhprimary.com/admissions/application-form'
WHERE name = 'Victory Heights Primary School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsnewmillenniumschool-dubaihills.com/',
  address = 'Al Khail Road, Dubai Hills, Dubai, UAE',
  admissions_contact_phone = '+971 4 445 2900',
  tour_booking_url = 'https://www.gemsnewmillenniumschool-dubaihills.com/Admissions/School-Tours',
  application_url = 'https://www.gemsnewmillenniumschool-dubaihills.com/Admissions/Enrol-Online'
WHERE name = 'GEMS New Millennium School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://arcadia.sch.ae/',
  address = 'P.O. Box 283800, Dubai, UAE',
  admissions_contact_email = 'info@arcadia.sch.ae',
  admissions_contact_phone = '+971 4 552 2600',
  tour_booking_url = 'https://arcadia.sch.ae/book-a-tour-service',
  application_url = 'https://arcadia.sch.ae/admission-enquiry/'
WHERE name = 'Arcadia British School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.brightoncollegedubai.ae/',
  address = 'Al Barsha South, Dubai, UAE',
  admissions_contact_email = 'admissions@brightoncollegedubai.ae',
  admissions_contact_phone = '+971 4 387 1116',
  tour_booking_url = 'https://www.brightoncollegedubai.ae/admissions/book-a-tour'
WHERE name = 'Brighton College Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.dubaiheightsacademy.com/'
WHERE name = 'Dubai Heights Academy'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsfirstpointschool-dubai.com/en/',
  address = 'The Villa, Dubai Al Ain Road, Dubailand, Dubai, UAE',
  admissions_contact_phone = '+971 4 278 9700',
  tour_booking_url = 'https://www.gemsfirstpointschool-dubai.com/en/school-tours',
  application_url = 'https://www.gemsfirstpointschool-dubai.com/en/apply-now'
WHERE name = 'GEMS First Point School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsfoundersschool-dubai.com/en',
  address = 'Al Barsha South, Dubai, UAE',
  admissions_contact_phone = '+971 4 519 5222',
  tour_booking_url = 'https://www.gemsfoundersschool-dubai.com/en/Admissions/School-Tours',
  application_url = 'https://www.gemsfoundersschool-dubai.com/en/Admissions/Enrol-Online'
WHERE name = 'GEMS Founders School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.royaldubaischool.com',
  address = 'Al Mizhar, Dubai, UAE',
  tour_booking_url = 'https://www.royaldubaischool.com/en/Admissions/School-Tours',
  application_url = 'https://www.royaldubaischool.com/en/Admissions/Enrol-Online'
WHERE name = 'GEMS Royal Dubai School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.hartlandinternational.com/',
  address = 'Sobha Hartland, Nad Al Sheba, Mohammed Bin Rashid Al Maktoum City, Dubai, UAE',
  admissions_contact_email = 'admissions@hartlandinternational.com',
  admissions_contact_phone = '+971 4 407 9444',
  tour_booking_url = 'https://www.hartlandinternational.com/events/',
  application_url = 'https://www.hartlandinternational.com/admissions-process/'
WHERE name = 'Hartland International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://hisdubai.ae/',
  address = 'Umm Al Sheif, Jumeirah, Dubai, UAE',
  admissions_contact_phone = '+971 4 348 3314',
  tour_booking_url = 'https://hisdubai.ae/school-tour/',
  application_url = 'https://hisdubai.ae/apply/'
WHERE name = 'Horizon International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://jebelalischool.org/',
  address = 'Damac Hills, Dubai, UAE 17111',
  admissions_contact_email = 'jaschool@jebelalischool.org',
  admissions_contact_phone = '+971 4 884 6485',
  tour_booking_url = 'https://jas.openapply.com/roi',
  application_url = 'https://jas.openapply.com/apply'
WHERE name = 'Jebel Ali School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.kentcollege.sch.ae/'
WHERE name = 'Kent College Dubai'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://kings-edu.com/nadalsheba/'
WHERE name = 'Kings School Nad Al Sheba'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.rafflesis.com/',
  address = 'Al Baghla Street, Umm Suqeim 3, Dubai, UAE',
  admissions_contact_phone = '+971 4 427 1200',
  tour_booking_url = 'https://www.rafflesis.com/tours-ris',
  application_url = 'https://www.rafflesis.com/apply-now-ris'
WHERE name = 'Raffles International School - Umm Suqeim South'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.rpsdubai.com/',
  address = 'Arabian Ranches 2, Dubai, United Arab Emirates, P.O. Box 644818',
  admissions_contact_phone = '+971 4 442 9765',
  tour_booking_url = 'https://www.rpsdubai.com/school-tours/',
  application_url = 'https://www.rpsdubai.com/register/'
WHERE name = 'Ranches Primary School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://risdubai.com/',
  address = 'Emaar''s The Greens, Emirates Living Community, First Al Khail Street, PO Box 24857, Dubai, UAE',
  admissions_contact_email = 'admissions.ris@forteseducation.com',
  admissions_contact_phone = '+971 4 360 8830',
  tour_booking_url = 'https://enquiry.risdubai.com/enrolment-campaign?s=WEB',
  application_url = 'https://applynow.risdubai.com/Admissions/Enquiry'
WHERE name = 'Regent International Private School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.reptonalbarsha.org/',
  address = 'Repton School Al Barsha, Al Barsha South, P.O. Box 391984, Dubai, UAE',
  admissions_contact_email = 'admissions@reptonalbarsha.org',
  admissions_contact_phone = '+971 800 737866',
  tour_booking_url = 'https://www.reptonalbarsha.org/school-tour/',
  application_url = 'https://www.reptonalbarsha.org/apply/'
WHERE name = 'Repton Al Barsha'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.rgsgd.com/',
  address = 'D 61 - Tilal Al Ghaf, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions@rgsgd.com',
  admissions_contact_phone = '+971 4 446 4333',
  tour_booking_url = 'https://www.rgsgd.com/school-tour/',
  application_url = 'https://www.rgsgd.com/apply/'
WHERE name = 'Royal Grammar School Guildford Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://safabritishschool.com/',
  address = 'P.O. Box 71091, Dubai, UAE (Al Safa 1, Jumeirah)',
  admissions_contact_phone = '04 388 4300',
  tour_booking_url = 'https://safabritishschool.com/school-visits-and-tours',
  application_url = 'https://safabritishschool.com/enrol-online'
WHERE name = 'Safa British School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.englishcollegedubai.com/',
  address = 'Al Safa 1, off Sheikh Zayed Road, opp. Oasis Mall, Dubai, UAE',
  admissions_contact_email = 'Info@englishcollege.ac.ae',
  admissions_contact_phone = '+971 4 394 3465',
  tour_booking_url = 'https://www.englishcollegedubai.com/admissions/book-a-tour',
  application_url = 'https://www.englishcollegedubai.com/admissions/enquire-now'
WHERE name = 'The English College Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.thewinchesterschool.com/',
  address = 'The Gardens, Jebel Ali, Dubai, United Arab Emirates',
  admissions_contact_phone = '+9714 8820444',
  application_url = 'https://www.thewinchesterschool.com/Admissions/Enrol-Online'
WHERE name = 'The Winchester School - Jabal Ali'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.nordangliaeducation.com/nas-dubai'
WHERE name = 'Nord Anglia International School Dubai'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.wellingtoninternationalschool.com/',
  address = 'Al Sufouh Area, Sheikh Zayed Road, Dubai, United Arab Emirates',
  admissions_contact_phone = '+971 4 307 3000',
  tour_booking_url = 'https://www.wellingtoninternationalschool.com/Admissions/School-Tour',
  application_url = 'https://www.wellingtoninternationalschool.com/Admissions/Enrol-Online'
WHERE name = 'GEMS Wellington International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemswellingtonacademy-dso.com/en/',
  address = 'Silicon Oasis, Dubai, P.O. Box 49746, United Arab Emirates',
  admissions_contact_email = 'registrar_wso@gemsedu.com',
  admissions_contact_phone = '+971 4 515 9000',
  tour_booking_url = 'https://www.gemswellingtonacademy-dso.com/en/book-a-tour',
  application_url = 'https://www.gemswellingtonacademy-dso.com/en/apply-now'
WHERE name = 'GEMS Wellington Academy - Dubai Silicon Oasis'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemswellingtonacademy-alkhail.com/en/',
  tour_booking_url = 'https://www.gemswellingtonacademy-alkhail.com/en/Admissions/School-Tours',
  application_url = 'https://www.gemswellingtonacademy-alkhail.com/en/Admissions/Enrol-Online'
WHERE name = 'GEMS Wellington Academy - Al Khail'
  AND (website_url IS NULL OR website_url = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.reptondubai.org/',
  address = 'Repton School Dubai, Nad Al Sheba 3, P.O. Box 300331, Dubai, UAE',
  admissions_contact_email = 'info@reptondubai.org',
  admissions_contact_phone = '+971 800 737866',
  tour_booking_url = 'https://www.reptondubai.org/school-tour/',
  application_url = 'https://www.reptondubai.org/apply/'
WHERE name = 'Repton School Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://sunmarke.com/',
  address = 'Behind Limitless Building, Al Khail Road, District 5, Jumeirah Village Triangle, PO Box 24857, Dubai, UAE',
  admissions_contact_phone = '+971 4 423 8900',
  tour_booking_url = 'https://enquiry.sunmarke.com/enrolment-campaign?s=WEB',
  application_url = 'https://applynow.sunmarke.com/'
WHERE name = 'Sunmarke School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://eischools.ae/jumeirah',
  admissions_contact_email = 'eisjadmission@eischools.ae',
  admissions_contact_phone = '+971 4 3489804',
  tour_booking_url = 'https://reg.eischools.ae/',
  application_url = 'https://eischools.ae/jumeirah/admission-form'
WHERE name = 'Emirates International School Jumeirah'
  AND (website_url IS NULL OR website_url = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.disdubai.ae/',
  address = 'Al Badia, Dubai Festival City, Dubai, United Arab Emirates',
  admissions_contact_email = 'Registrar@disdubai.ae',
  admissions_contact_phone = '+971 4 232 5552',
  tour_booking_url = 'https://www.disdubai.ae/book-a-tour-dis',
  application_url = 'https://www.disdubai.ae/apply-dis'
WHERE name = 'Deira International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.diadubai.com/',
  address = 'First Al Khail Street, Emirates Hills, Dubai, U.A.E.',
  admissions_contact_phone = '+971 4 3684111',
  tour_booking_url = 'https://www.diadubai.com/visit-dia-eh',
  application_url = 'https://www.diadubai.com/apply-dia-eh'
WHERE name = 'Dubai International Academy - Emirates Hills'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsworldacademy-dubai.com/en/',
  address = 'Al Barsha South, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions_gwa@gemsedu.com',
  admissions_contact_phone = '+971 4 373 6373',
  tour_booking_url = 'https://www.gemsworldacademy-dubai.com/en/book-a-tour',
  application_url = 'https://www.gemsworldacademy-dubai.com/en/apply-now'
WHERE name = 'GEMS World Academy Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://nlcsdubai.ae/',
  address = 'Nad Al Sheba, Mohammed Bin Rashid Al Maktoum City, PO Box 242773, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions@nlcsdubai.ae',
  admissions_contact_phone = '+971 4 319 0888',
  tour_booking_url = 'https://nlcsdubai.ae/school-events/',
  application_url = 'https://app.nlcsdubai.ae/login'
WHERE name = 'North London Collegiate School Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.uasdubai.ae/',
  address = 'P.O. Box 79133, Al Badia, Dubai Festival City, Dubai, UAE',
  admissions_contact_email = 'admissions@uasdubai.ae',
  admissions_contact_phone = '+971 4 524 0444',
  tour_booking_url = 'https://www.uasdubai.ae/book-a-tour-uas',
  application_url = 'https://www.uasdubai.ae/apply-uas'
WHERE name = 'Universal American School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://dwight.ae/',
  address = 'Dubai Sports City, Dubai, UAE',
  admissions_contact_email = 'admissions@dwight.ae',
  admissions_contact_phone = '+971 4 279 8100',
  tour_booking_url = 'https://dwight.ae/visit/',
  application_url = 'https://dwight.ae/admissions/apply-now/'
WHERE name = 'Dwight School Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.fairgreen.ae/',
  address = 'P.O. Box 392024, The Sustainable City, Dubai, UAE',
  admissions_contact_phone = '+971 4 875 4999',
  tour_booking_url = 'https://www.fairgreen.ae/admissions/experience-our-school',
  application_url = 'https://fairgreen.openapply.com/apply'
WHERE name = 'Fairgreen International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.nordangliaeducation.com/sisd-dubai'
WHERE name = 'Swiss International Scientific School Dubai'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://uischool.ae/',
  address = 'Corner of Tripoli Street and Algeria Road, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissions@uptownschool.ae',
  admissions_contact_phone = '+971 4 251 5001',
  tour_booking_url = 'https://uischool.ae/book-a-tour',
  application_url = 'https://uischool.openapply.com/apply'
WHERE name = 'Uptown International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.dunecrest.ae/',
  address = 'P.O. Box 624265, Wadi Al Safa 3 (next to Al Barari), Dubai, UAE',
  admissions_contact_phone = '+971 4 508 7444',
  tour_booking_url = 'https://www.dunecrest.ae/fs/pages/902',
  application_url = 'https://www.dunecrest.ae/admissions/apply'
WHERE name = 'Dunecrest American School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsmodernacademy-dubai.com/',
  address = 'Nad Al Sheba, Dubai, UAE',
  tour_booking_url = 'https://www.gemsmodernacademy-dubai.com/Admissions/School-Tours',
  application_url = 'https://www.gemsmodernacademy-dubai.com/Admissions/Enrol-Online'
WHERE name = 'GEMS Modern Academy'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.collegiate.sch.ae/',
  address = '50 Al Maydar Street, Umm Suqeim 2, Dubai, U.A.E.',
  admissions_contact_phone = '+971 4 427 1400',
  tour_booking_url = 'https://www.collegiate.sch.ae/tour-and-open-houses-cis',
  application_url = 'https://www.collegiate.sch.ae/how-to-apply-cis'
WHERE name = 'Collegiate International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.jbschool.ae/',
  address = '53 B Street, off Al Wasl Road, Jumeira 1, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissionsadmin@jbschool.ae',
  admissions_contact_phone = '+971 (0)4 344 6931',
  tour_booking_url = 'https://jbs.openapply.com/events/new',
  application_url = 'https://jbs.openapply.com/apply'
WHERE name = 'Jumeira Baccalaureate School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.rwadubai.com/',
  address = '45QW+XQ9, Al Marcup Street, Umm Suqeim 3, Dubai, U.A.E',
  admissions_contact_phone = '+971 4 427 1300',
  tour_booking_url = 'https://www.rwadubai.com/school-tours-rwa',
  application_url = 'https://www.rwadubai.com/how-to-apply-rwa'
WHERE name = 'Raffles World Academy'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://eischools.ae/meadows',
  admissions_contact_email = 'eismadmission@eischools.ae',
  admissions_contact_phone = '+971 4 362 9009',
  tour_booking_url = 'https://reg.eischools.ae/',
  application_url = 'https://eischools.ae/meadows/admission-form'
WHERE name = 'Emirates International School Meadows'
  AND (website_url IS NULL OR website_url = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://gischool.ae/',
  address = 'Dubai Investments Park, Dubai, United Arab Emirates',
  admissions_contact_email = 'enquiry@gischool.ae',
  admissions_contact_phone = '+971 (0)4 885 6600',
  tour_booking_url = 'https://gischool.ae/book-a-tour',
  application_url = 'https://greenfield.openapply.com/apply'
WHERE name = 'Greenfield International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.daralmarefa.ae/'
WHERE name = 'Dar Al Marefa'
  AND (website_url IS NULL OR website_url = '');

UPDATE public.schools
SET
  website_url = 'https://aiadubai.com/',
  address = 'Al Khail, Makani No: 23466 82036, Dubai, United Arab Emirates',
  admissions_contact_email = 'admissionsaiam@aiadubai.com',
  admissions_contact_phone = '+971 50 846 4899',
  application_url = 'https://aiadubai.com/admissions'
WHERE name = 'Ambassador International Academy'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_email IS NULL OR admissions_contact_email = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.gemsakinternationalschool.com/',
  address = 'Al Warqa, Dubai, UAE',
  application_url = 'https://www.gemsakinternationalschool.com/en/Admissions/Enroll-Online'
WHERE name = 'GEMS Al Khaleej International School'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR application_url IS NULL OR application_url = '');

UPDATE public.schools
SET
  website_url = 'https://www.bloomworldacademy.ae/',
  address = '11 Street 50, Al Barsha South, Dubai, United Arab Emirates',
  admissions_contact_phone = '+971 4 371 4774',
  tour_booking_url = 'https://www.bloomworldacademy.ae/admissions/book-tour',
  application_url = 'https://www.bloomworldacademy.ae/admissions/apply-now'
WHERE name = 'Bloom World Academy Dubai'
  AND (website_url IS NULL OR website_url = '' OR address IS NULL OR address = '' OR admissions_contact_phone IS NULL OR admissions_contact_phone = '' OR tour_booking_url IS NULL OR tour_booking_url = '' OR application_url IS NULL OR application_url = '');

-- Note: "Dubai International Academy - Al Barsha" could not be confidently matched to an official
-- website within research scope and is intentionally left untouched -- needs manual follow-up.
