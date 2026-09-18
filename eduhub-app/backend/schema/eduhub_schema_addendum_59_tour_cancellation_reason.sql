-- ============================================================================
-- Addendum 59 -- a reason recorded when a tour is cancelled (September 2026,
-- Heather via WhatsApp): "I also need to cancel the Brighton tour and
-- record why on their profile."
--
-- Cancelling a tour (tour_status/tour2_status = 'cancelled') already had a
-- timestamp (tour_cancelled_at / tour2_cancelled_at, addendum 38 and 58),
-- but nothing captured *why* -- there was no field for it, so the only
-- place a reason could go was the general Feedback box, disconnected from
-- the cancellation itself and easy to overwrite later. This adds one text
-- column per tour slot, shown on the family's own School visits panel
-- right under the Cancelled badge so it reads as part of the tour record,
-- not a separate note.
-- ============================================================================

alter table public.school_shortlist add column if not exists tour_cancelled_reason text;
alter table public.school_shortlist add column if not exists tour2_cancelled_reason text;

comment on column public.school_shortlist.tour_cancelled_reason is
  'Why the Primary tour was cancelled, staff-entered alongside the Cancelled status. Not cleared automatically if the tour is later rebooked -- rebooking sets a new tour_date/tour_status, at which point this reason is just history unless staff blank it themselves.';
comment on column public.school_shortlist.tour2_cancelled_reason is
  'Same as tour_cancelled_reason, for the Secondary tour slot (addendum 58).';

notify pgrst, 'reload schema';
