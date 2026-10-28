-- Addendum 143: School Visits workflow -- timestamps for the school enquiry emails.
-- "Log a timestamp at every status change" (21 Oct 2026 spec).

-- When the availability/tour enquiry went to the school, and when a consultant
-- chose to skip it. Both null = still to do.
alter table public.school_shortlist add column if not exists enquiry_sent_at timestamptz;
alter table public.school_shortlist add column if not exists enquiry_skipped_at timestamptz;

-- When the parent was asked which days/times they are not free.
alter table public.families add column if not exists parent_availability_requested_at timestamptz;

notify pgrst, 'reload schema';
