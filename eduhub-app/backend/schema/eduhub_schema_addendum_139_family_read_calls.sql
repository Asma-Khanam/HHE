-- Addendum 139 (28 Oct 2026): Asma, client Calendar -- a family should see the
-- calls booked with their consultant on their own Calendar (date, time, who with,
-- join link). calendly_bookings was staff-only (addendum 105); this adds a
-- read-only policy for the family itself, on its own active bookings. A booking
-- is only linked to a family when the booker's email matched a parent, so
-- unmatched bookings stay hidden. Writes stay with staff and the webhook.
-- Safe to re-run. Needs addendum 105.

drop policy if exists "family read own calendly bookings" on public.calendly_bookings;
create policy "family read own calendly bookings" on public.calendly_bookings
  for select
  using (
    status = 'active'
    and family_id in (
      select id from public.families where account_user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
