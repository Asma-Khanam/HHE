-- Addendum 100 (12 Oct 2026): mark an assessment as in-person at the school.
--
-- Miss Lyndsay (list, 12 Oct 2026): "If assessments done in person, can
-- there be a tick box to show this". Today staff signal in-person
-- implicitly by leaving the Zoom/Teams join link empty, which isn't
-- obvious. This column makes it explicit so the dashboard can show an
-- "In person" badge and the UI can hide the online meeting fields.
--
-- Safe to re-run. Default false (not in person).

alter table public.applications
  add column if not exists assessment_in_person boolean not null default false;

comment on column public.applications.assessment_in_person is
  'True when the assessment is at the school (not online). Set by staff on the Assessment step. The online meeting fields (link / meeting id / passcode) are hidden on the UI when this is true.';

notify pgrst, 'reload schema';
