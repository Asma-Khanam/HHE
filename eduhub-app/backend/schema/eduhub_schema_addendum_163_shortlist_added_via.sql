-- Addendum 163: remember how a school got onto a family's shortlist (Nov 2026)
-- "consultant" = a consultant chose it with + Shortlist a school.
-- "suggested" = it was accepted from the Suggested schools card, and the fit
-- score it had at that moment is kept. Schools already on a shortlist count as
-- chosen by a consultant. Safe to run more than once.

alter table public.school_shortlist
  add column if not exists added_via text not null default 'consultant';

alter table public.school_shortlist drop constraint if exists school_shortlist_added_via_check;
alter table public.school_shortlist add constraint school_shortlist_added_via_check
  check (added_via in ('consultant', 'suggested'));

alter table public.school_shortlist
  add column if not exists suggestion_score smallint;

comment on column public.school_shortlist.added_via is
  'consultant = chosen by a consultant; suggested = accepted from the Suggested schools card. See addendum 163.';
comment on column public.school_shortlist.suggestion_score is
  'The fit score (0-100) the school had on the Suggested schools card when it was accepted. Null for consultant picks.';

notify pgrst, 'reload schema';
