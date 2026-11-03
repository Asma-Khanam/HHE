-- Addendum 151 (3 Nov 2026): Consultations can be added by hand.
--
-- Miss Lyndsay had a relocation call with someone who did not book through
-- Calendly and wants it on the dashboard like any other consultation. A call
-- added by hand is a row in calendly_bookings, marked added_by_hand, so it
-- gets the same card, Zoom link and summary matching, family linking and
-- Meetings note as a Calendly booking. Calendly bookings themselves can still
-- not be added, changed or deleted by staff (Calendly is their source);
-- only rows marked added_by_hand can be. Needs addenda 105, 106 and 141.
-- Safe to re-run.

alter table public.calendly_bookings add column if not exists added_by_hand boolean not null default false;
alter table public.calendly_bookings add column if not exists added_by uuid default auth.uid();

drop policy if exists "staff add manual consultations" on public.calendly_bookings;
create policy "staff add manual consultations" on public.calendly_bookings
  for insert with check (public.is_staff() and added_by_hand = true);

drop policy if exists "staff delete manual consultations" on public.calendly_bookings;
create policy "staff delete manual consultations" on public.calendly_bookings
  for delete using (public.is_staff() and added_by_hand = true);

notify pgrst, 'reload schema';
