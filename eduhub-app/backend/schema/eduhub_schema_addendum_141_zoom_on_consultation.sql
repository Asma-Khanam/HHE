-- Addendum 141 (28 Oct 2026): A consultation can hold its own Zoom meeting ID.
-- When a consultant pastes a Zoom link onto a Consultations booking, the ID is
-- saved on the booking so the Zoom status chip (saved / pending / received)
-- stays right, and so the booking's AI summary can be matched later even if
-- the booking has no Calendly join_url with a Zoom link in it.
--
-- Needs addendum 105. Safe to re-run.

alter table public.calendly_bookings add column if not exists zoom_meeting_id text;
create index if not exists idx_calendly_bookings_zoom on public.calendly_bookings(zoom_meeting_id);

notify pgrst, 'reload schema';
