-- ============================================================================
-- Addendum 78 — 2026-09-24: Claude reads each school email
--
-- Every inbound email on the Emails tab gets a short AI reading: a summary,
-- what kind of email it is (offer / assessment / documents requested ...),
-- any dates in it, and up to three suggested to-dos. Claude only suggests;
-- a consultant clicks "Add as task" for anything to actually happen.
--
-- Written by the founders app's serverless functions (webhook on arrival,
-- or the "Summarise" button). case_notes stays staff-only, as before.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ============================================================================

alter table public.case_notes add column if not exists ai_insight jsonb;
alter table public.case_notes add column if not exists ai_insight_at timestamptz;
alter table public.case_notes add column if not exists ai_insight_error text;

comment on column public.case_notes.ai_insight is
  'Claude''s reading of an email: {summary, category, urgency, school, key_dates[], suggested_tasks[], model}. Suggestions only.';

notify pgrst, 'reload schema';
