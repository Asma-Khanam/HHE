-- ============================================================================
-- Eduhub Data Model — schema addendum #1
-- Heather Harries Education Hub / Learn with Eduhub Project
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement is ADD COLUMN IF NOT EXISTS.
--
-- WHAT THIS DOES:
--   Adds columns for every field the application form already collects but
--   that, until now, only lived in the browser's local state (it was never
--   sent to Supabase, so it didn't survive a page reload). After this runs
--   and the matching frontend whitelist update ships, all of these save for
--   real, same as name/DOB/nationality/etc already did.
--
--   Also adds the brand-new fields from tonight's round: child notes, sports
--   achievements, and a contact name + phone for the current school (to sit
--   alongside the existing contact email). No new tables are needed — the
--   Special Education Needs and sports-achievement supporting documents both
--   reuse the existing polymorphic `documents` table via new document_type
--   values ("sen_supporting_documents", "achievement_certificate"), which
--   needs no schema change at all.
--
--   Nothing here is NOT NULL and nothing has a CHECK constraint — these are
--   all optional, free-typed fields (several are Yes/No dropdowns that start
--   out as an empty string before the family answers them), so a strict
--   constraint would risk breaking autosave on a half-filled form. Same
--   posture as the original schema's nationality/religion/etc columns.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- children — fields from the general info / additional info sections
-- ----------------------------------------------------------------------------
alter table public.children add column if not exists first_name text;
alter table public.children add column if not exists middle_name text;
alter table public.children add column if not exists last_name text;
alter table public.children add column if not exists preferred_name text;
alter table public.children add column if not exists gender text;
alter table public.children add column if not exists academic_year_of_entry text;
alter table public.children add column if not exists year_group_applying_for text;
alter table public.children add column if not exists term text;
alter table public.children add column if not exists english_first_home_language text;
alter table public.children add column if not exists english_proficiency text;
alter table public.children add column if not exists has_sen text;
alter table public.children add column if not exists sen_description text;
alter table public.children add column if not exists gifted_talented text;
alter table public.children add column if not exists has_transfer_certificate text;

-- New this round:
alter table public.children add column if not exists sports_achievements text;
alter table public.children add column if not exists notes text;

-- ----------------------------------------------------------------------------
-- current_schools — fields from the Current school section
-- ----------------------------------------------------------------------------
alter table public.current_schools add column if not exists year_group_of_leaving text;
alter table public.current_schools add column if not exists date_attended_last date;
alter table public.current_schools add column if not exists curriculum text;
alter table public.current_schools add column if not exists reason_for_leaving text;

-- New this round — she asked for a contact name and phone alongside the
-- existing contact email:
alter table public.current_schools add column if not exists contact_name text;
alter table public.current_schools add column if not exists contact_phone text;
