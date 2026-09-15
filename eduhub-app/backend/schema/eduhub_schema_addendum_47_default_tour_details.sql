-- ============================================================================
-- Addendum 47 — 2026-09-15: on-the-day tour details move from per-family to
-- the school record
--
-- What this is for
-- ----------------
-- Gate/Building/Parking/Ask for/Bring were previously typed in fresh for
-- every family on that family's own "Edit tour" form (school_shortlist.
-- tour_gate/tour_building/tour_parking/tour_ask_for/tour_bring, addendum
-- 38). In practice this is the same information every time for a given
-- school -- staff were retyping "Main gate, sign in at reception, park on
-- Street X, ask for admissions, bring passport copies" for every single
-- family touring that school.
--
-- Per the founders' request, these become a one-time set of defaults on
-- the school record itself (schools.default_tour_gate/default_tour_
-- building/default_tour_parking/default_tour_ask_for/default_tour_bring),
-- edited once per school on the School record card, and shown read-only
-- (greyed out) on each family's "Edit tour" form -- no more retyping.
--
-- This migration only adds the five new nullable columns and backfills them
-- from the most common non-null value already on file for that school
-- (across all its school_shortlist rows), so no detail staff already typed
-- in is lost. It does NOT drop the old per-family columns -- once the new
-- UI ships, nothing writes to them anymore, but keeping them avoids a
-- destructive change bundled with a UI change; they can be dropped later in
-- a follow-up addendum once we're confident nothing needs them.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Needs addendum 38 already applied.
-- ============================================================================

alter table public.schools add column if not exists default_tour_gate text;
alter table public.schools add column if not exists default_tour_building text;
alter table public.schools add column if not exists default_tour_parking text;
alter table public.schools add column if not exists default_tour_ask_for text;
alter table public.schools add column if not exists default_tour_bring text;

comment on column public.schools.default_tour_gate is
  'On-the-day tour default: which gate/entrance to use. Set once on the school record, shown read-only on every family''s "Edit tour" form (school_shortlist no longer carries a per-family copy of this).';
comment on column public.schools.default_tour_building is
  'On-the-day tour default: which building to go to. See default_tour_gate.';
comment on column public.schools.default_tour_parking is
  'On-the-day tour default: parking instructions. See default_tour_gate.';
comment on column public.schools.default_tour_ask_for is
  'On-the-day tour default: who to ask for at reception. See default_tour_gate.';
comment on column public.schools.default_tour_bring is
  'On-the-day tour default: what to bring (ID, documents, etc). See default_tour_gate.';

-- Backfill each school's new default from whatever a family already had
-- typed in for that field, so existing detail isn't lost the moment the UI
-- switches over. Picks the most frequently repeated non-null value per
-- school (a reasonable "this is what we always tell people" signal); ties
-- broken arbitrarily since it's just a starting point staff can correct on
-- the school record afterwards.
with ranked_gate as (
  select school_id, tour_gate,
         row_number() over (partition by school_id order by count(*) desc) as rn
  from public.school_shortlist
  where tour_gate is not null and tour_gate <> ''
  group by school_id, tour_gate
)
update public.schools s
set default_tour_gate = r.tour_gate
from ranked_gate r
where r.school_id = s.id and r.rn = 1 and s.default_tour_gate is null;

with ranked_building as (
  select school_id, tour_building,
         row_number() over (partition by school_id order by count(*) desc) as rn
  from public.school_shortlist
  where tour_building is not null and tour_building <> ''
  group by school_id, tour_building
)
update public.schools s
set default_tour_building = r.tour_building
from ranked_building r
where r.school_id = s.id and r.rn = 1 and s.default_tour_building is null;

with ranked_parking as (
  select school_id, tour_parking,
         row_number() over (partition by school_id order by count(*) desc) as rn
  from public.school_shortlist
  where tour_parking is not null and tour_parking <> ''
  group by school_id, tour_parking
)
update public.schools s
set default_tour_parking = r.tour_parking
from ranked_parking r
where r.school_id = s.id and r.rn = 1 and s.default_tour_parking is null;

with ranked_ask_for as (
  select school_id, tour_ask_for,
         row_number() over (partition by school_id order by count(*) desc) as rn
  from public.school_shortlist
  where tour_ask_for is not null and tour_ask_for <> ''
  group by school_id, tour_ask_for
)
update public.schools s
set default_tour_ask_for = r.tour_ask_for
from ranked_ask_for r
where r.school_id = s.id and r.rn = 1 and s.default_tour_ask_for is null;

with ranked_bring as (
  select school_id, tour_bring,
         row_number() over (partition by school_id order by count(*) desc) as rn
  from public.school_shortlist
  where tour_bring is not null and tour_bring <> ''
  group by school_id, tour_bring
)
update public.schools s
set default_tour_bring = r.tour_bring
from ranked_bring r
where r.school_id = s.id and r.rn = 1 and s.default_tour_bring is null;

notify pgrst, 'reload schema';
