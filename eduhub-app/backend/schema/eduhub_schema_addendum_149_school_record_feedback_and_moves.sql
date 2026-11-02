-- Addendum 149 (2 Nov 2026): the school record after the 30/10/2026 meeting.
--
-- Two changes, both on what a consultant sees against one school:
--
-- 1. Feedback in one place. Until now a school row held a shared "How the
--    tour went" box (school_shortlist.feedback_text, tagged family or staff,
--    so whoever wrote last owned it) AND a separate note in shortlist_notes.
--    The meeting asked for one Feedback section split into Parent feedback
--    and Consultant observations. Families can READ every column of
--    school_shortlist, so the consultant's half stays in shortlist_notes,
--    which is staff-only, and that table becomes the consultant
--    observations. feedback_text is left to the parent alone.
--    Nothing is deleted: anything a consultant had typed into the shared
--    box is copied into their observations first, keeping whatever note was
--    already there.
--
-- 2. A child can move schools. family_placements held only the school and
--    the start date, so a child who left had no way to say so. A placement
--    now has a status, the day it ended, where they went and why.
--
-- Safe to re-run. Needs addenda 36, 63, 70, 85 and 88.

-- 1. Consultant observations (the staff-only note becomes the observations) ---
comment on table public.shortlist_notes is
  'Consultant observations on one shortlisted school for one family, plus anything pasted from admissions. Staff only -- families have no policy on this table, which is why the consultant half of Feedback lives here and not on school_shortlist (families can read that). Parent feedback is school_shortlist.feedback_text. See addenda 63 and 149.';

-- Move anything a consultant typed into the shared feedback box across. The
-- note keeps what it already had, with the older feedback added under it.
insert into public.shortlist_notes (shortlist_id, body, updated_at)
select s.id, s.feedback_text, coalesce(s.feedback_at, now())
  from public.school_shortlist s
 where s.feedback_by = 'staff'
   and coalesce(btrim(s.feedback_text), '') <> ''
on conflict (shortlist_id) do update
   set body = case
                when coalesce(btrim(public.shortlist_notes.body), '') = '' then excluded.body
                when position(btrim(excluded.body) in public.shortlist_notes.body) > 0 then public.shortlist_notes.body
                else public.shortlist_notes.body || E'\n\n' || excluded.body
              end,
       updated_at = now();

update public.school_shortlist s
   set feedback_text = null,
       feedback_by = null,
       feedback_at = null
 where s.feedback_by = 'staff'
   and coalesce(btrim(s.feedback_text), '') <> ''
   and exists (
     select 1 from public.shortlist_notes n
      where n.shortlist_id = s.id
        and position(btrim(s.feedback_text) in n.body) > 0
   );

-- 2. A placement can end ------------------------------------------------------
alter table public.family_placements
  add column if not exists placement_status text not null default 'current',
  add column if not exists ended_on date,
  add column if not exists moved_to_school text,
  add column if not exists moved_reason text,
  add column if not exists moved_note text,
  add column if not exists moved_by uuid references auth.users(id) on delete set null,
  add column if not exists moved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'family_placements_placement_status_check'
  ) then
    alter table public.family_placements
      add constraint family_placements_placement_status_check
      check (placement_status in ('current', 'moved'));
  end if;
end $$;

comment on column public.family_placements.placement_status is
  'current = the child is at this school. moved = they have left it (ended_on, moved_to_school, moved_reason, moved_note say when, where and why). Nothing is deleted when a child moves. See addendum 149.';

create index if not exists idx_family_placements_status on public.family_placements(family_id, placement_status);

notify pgrst, 'reload schema';
