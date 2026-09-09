-- ============================================================================
-- Addendum 30 — 2026-09-09: Section 6, "Current school" (CS-02, CS-04,
-- CS-05, CS-06)
--
-- What this is for
-- ----------------
-- Two separate things, both from Section 6 of the change request:
--
-- 1. CS-02 — "If a parent chooses 'Other' [for curriculum], they can add the
--    curriculum that is not listed, and it joins the dropdown for future
--    families." A new, tiny standalone table rather than a column on
--    current_schools: it's a shared, growing list of dropdown options, not
--    per-family data.
--
--      curriculum_options
--        id          uuid    primary key
--        name        text    unique — the curriculum name a family typed in
--        created_at  timestamptz
--
--    Readable by anyone signed in (family or staff — the family-facing form
--    needs to read it to build its own dropdown) and insertable by anyone
--    signed in (a family adding a new one) — nobody can edit or delete an
--    existing entry from the client.
--
-- 2. CS-04/CS-05/CS-06 — three new optional questions, each a status column
--    plus its own free-text detail column, added to current_schools (the
--    same per-child "current school" record CS-01/CS-02/CS-03 already live
--    on):
--
--      education_gaps_status      text   — CS-04
--      education_gaps_details     text   — CS-04, shown only for "Yes"
--      repeated_year_status       text   — CS-05
--      repeated_year_details      text   — CS-05, shown for any "Yes" or
--                                           "being discussed" answer
--      school_refusal_status      text   — CS-06
--      school_refusal_details     text   — CS-06, shown for any "Yes" answer
--
-- Note on CS-01: "Remove Date last attended" needed no schema change —
-- current_schools.date_attended_last is left exactly as it was in the
-- database (nothing ever writes to it from the family's side any more,
-- and the founders app no longer displays it), so there's nothing to run
-- for that one.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

create table if not exists public.curriculum_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.curriculum_options is
  'CS-02 (September 2026 change request): curriculum names families have typed in via "Other" on the Current school step, joining the dropdown for every family after them.';

alter table public.curriculum_options enable row level security;

drop policy if exists "curriculum_options_read_authenticated" on public.curriculum_options;
create policy "curriculum_options_read_authenticated" on public.curriculum_options
  for select
  using (auth.role() = 'authenticated');

-- Any signed-in family can add a new one (that's the whole point — no staff
-- step in between), but nobody can edit or remove an existing entry from
-- the client; the unique constraint on name means a second family typing
-- the same value just no-ops (see lib/curriculumOptions.js's upsert).
drop policy if exists "curriculum_options_insert_authenticated" on public.curriculum_options;
create policy "curriculum_options_insert_authenticated" on public.curriculum_options
  for insert
  with check (auth.role() = 'authenticated');

alter table public.current_schools
  add column if not exists education_gaps_status text,
  add column if not exists education_gaps_details text,
  add column if not exists repeated_year_status text,
  add column if not exists repeated_year_details text,
  add column if not exists school_refusal_status text,
  add column if not exists school_refusal_details text;

comment on column public.current_schools.education_gaps_status is
  'CS-04 (September 2026 change request): "Has your child had any gaps in their education?"';
comment on column public.current_schools.education_gaps_details is
  'Free text for CS-04, only collected when education_gaps_status is "Yes".';
comment on column public.current_schools.repeated_year_status is
  'CS-05: "Has your child ever repeated a year, or been asked to?"';
comment on column public.current_schools.repeated_year_details is
  'Free text for CS-05, only collected for any "Yes" or "being discussed" answer.';
comment on column public.current_schools.school_refusal_status is
  'CS-06: "Has your child ever been refused a place at a school, or asked to leave one?"';
comment on column public.current_schools.school_refusal_details is
  'Free text for CS-06, only collected for any "Yes" answer.';

notify pgrst, 'reload schema';
