-- Addendum 73: date the family actually accepted an offer (23 Sept 2026)
-- "Placed?" and "Start date" already exist via family_placements (addendum 70)
-- -- this just adds the missing "Accepted on" date next to it.

alter table public.applications add column if not exists offer_accepted_on date;

comment on column public.applications.offer_accepted_on is
  'Date the family confirmed they are accepting the offer. Separate from offer_decision_by (the deadline to decide).';

notify pgrst, 'reload schema';
