-- Addendum 106 (13 Oct 2026): Calendly bookings become a "Consultations" list.
--
-- Miss Lyndsay's request: relocation consultation bookings made in Calendly
-- should come through to the dashboard with the booker's basic details. The
-- booker is usually not a client yet, so the booking is kept on its own (not
-- on a family) and linked to a family later, either automatically when a
-- parent's email matches or by staff with the "Link to family" button.
-- This adds the extra details Calendly sends: phone, the booking form answers,
-- and payment details if the event takes payment through Calendly.
-- Staff can also now write notes on a booking. Needs addendum 105. Safe to re-run.

alter table public.calendly_bookings add column if not exists invitee_phone text;
alter table public.calendly_bookings add column if not exists answers jsonb not null default '[]'::jsonb;
alter table public.calendly_bookings add column if not exists payment_amount numeric;
alter table public.calendly_bookings add column if not exists payment_currency text;
alter table public.calendly_bookings add column if not exists payment_paid boolean;
alter table public.calendly_bookings add column if not exists staff_note text;

notify pgrst, 'reload schema';
