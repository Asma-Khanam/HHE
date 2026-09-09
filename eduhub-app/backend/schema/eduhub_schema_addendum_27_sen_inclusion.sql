-- ============================================================================
-- Addendum 27 — 2026-09-09: SEN-01, "SEN and inclusion" (Section 5)
--
-- What this is for
-- ----------------
-- Section 5 of the change request replaces the old single Yes/No SEN
-- question (children.has_sen / sen_description, kept in place — old data
-- stays readable) with a calmer, more specific set of four new columns:
--
--   sen_status                text     — the SEN-01 status question, one of
--                                         five fixed options
--   sen_concerns_description  text     — free text, only shown when the
--                                         parent picked "no formal diagnosis,
--                                         but we have concerns"
--   sen_diagnoses              text[]  — "select all that apply" diagnosis
--                                         list, only shown for "formally
--                                         identified or diagnosed"
--   sen_diagnosis_other        text    — free text for "Other, please tell
--                                         us" inside that diagnosis list
--
-- New columns rather than changing has_sen/sen_description in place, same
-- reasoning as addendum 25 (CH-04/CH-05): a type or meaning change on an
-- existing column risks silently misreading old data, where a brand-new
-- column just starts empty and is unambiguous.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.children
  add column if not exists sen_status text,
  add column if not exists sen_concerns_description text,
  add column if not exists sen_diagnoses text[],
  add column if not exists sen_diagnosis_other text;

comment on column public.children.sen_status is
  'SEN-01 (September 2026 change request): "Does your child have any identified special educational needs, learning difficulties or a diagnosis?" — one of five fixed options. Replaces the old has_sen Yes/No question for new answers; has_sen/sen_description are kept for existing records.';
comment on column public.children.sen_concerns_description is
  'Free text, only collected when sen_status is "No formal diagnosis, but we have concerns".';
comment on column public.children.sen_diagnoses is
  'Select-all-that-apply diagnosis list, only collected when sen_status is "Yes, formally identified or diagnosed".';
comment on column public.children.sen_diagnosis_other is
  'Free text for "Other, please tell us" inside sen_diagnoses.';

notify pgrst, 'reload schema';
