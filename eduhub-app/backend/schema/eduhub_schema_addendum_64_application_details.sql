-- Addendum 64: editable application details on the founders' Applications tab.
-- Assessment details (meeting link etc.) once an application is submitted --
-- Heather's tracker: "Meeting links and details, which then pull through to
-- the client dashboard." `notes` and `submitted_at` already existed.

alter table public.applications add column if not exists assessment_date date;
alter table public.applications add column if not exists assessment_link text;
alter table public.applications add column if not exists assessment_notes text;

notify pgrst, 'reload schema';
