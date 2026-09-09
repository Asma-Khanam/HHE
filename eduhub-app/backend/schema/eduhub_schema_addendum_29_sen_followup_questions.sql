-- ============================================================================
-- Addendum 29 — 2026-09-09: SEN-04 through SEN-11, the rest of the "SEN and
-- inclusion" section
--
-- What this is for
-- ----------------
-- Ten more columns on children, covering the remaining questions in Section
-- 5 (SEN-04, SEN-05, SEN-06, SEN-07, SEN-08, SEN-09, SEN-10, SEN-11):
--
--   sen_intervention_status          text     — SEN-04, required. "Has your
--                                                child ever been taken out
--                                                of class for intervention
--                                                or support sessions?"
--   sen_intervention_types           text[]   — SEN-05, select all that
--                                                apply, only asked when
--                                                SEN-04 is any "Yes" answer.
--   sen_intervention_other           text     — free text for SEN-05's
--                                                "Other".
--   sen_intervention_frequency       text     — SEN-06, only asked when
--                                                SEN-05 has at least one
--                                                answer.
--   sen_lsa_status                   text     — SEN-07, required. Learning
--                                                Support Assistant / shadow
--                                                teacher status.
--   sen_descriptive_words            text[]   — SEN-08, select all that
--                                                apply, defaults to nothing
--                                                ticked.
--   sen_outside_professionals        text[]   — SEN-09, select all that
--                                                apply.
--   sen_outside_professionals_other  text     — free text for SEN-09's
--                                                "Other".
--   sen_disclosure_preference        text     — SEN-10. Governs what HHE's
--                                                team may share with a
--                                                school — shown as a badge
--                                                on the child's card in the
--                                                founders app.
--   sen_additional_notes             text     — SEN-11, optional free text.
--
-- All ten ship together since they were all built in the same pass — unlike
-- SEN-01 (addendum 27) and SEN-02 (addendum 28), which shipped separately.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run.
-- ============================================================================

alter table public.children
  add column if not exists sen_intervention_status text,
  add column if not exists sen_intervention_types text[],
  add column if not exists sen_intervention_other text,
  add column if not exists sen_intervention_frequency text,
  add column if not exists sen_lsa_status text,
  add column if not exists sen_descriptive_words text[],
  add column if not exists sen_outside_professionals text[],
  add column if not exists sen_outside_professionals_other text,
  add column if not exists sen_disclosure_preference text,
  add column if not exists sen_additional_notes text;

comment on column public.children.sen_intervention_status is
  'SEN-04 (September 2026 change request), required: "Has your child ever been taken out of class for intervention or support sessions?"';
comment on column public.children.sen_intervention_types is
  'SEN-05: select-all-that-apply session types, only collected when sen_intervention_status is any "Yes" answer.';
comment on column public.children.sen_intervention_other is
  'Free text for "Other" inside sen_intervention_types.';
comment on column public.children.sen_intervention_frequency is
  'SEN-06: how often the sen_intervention_types sessions happen, only collected once sen_intervention_types has at least one answer.';
comment on column public.children.sen_lsa_status is
  'SEN-07, required: Learning Support Assistant / shadow teacher status.';
comment on column public.children.sen_descriptive_words is
  'SEN-08: select-all-that-apply words/phrases ever used to describe the child. Defaults to nothing ticked.';
comment on column public.children.sen_outside_professionals is
  'SEN-09: select-all-that-apply professionals the child currently works with outside school.';
comment on column public.children.sen_outside_professionals_other is
  'Free text for "Other" inside sen_outside_professionals.';
comment on column public.children.sen_disclosure_preference is
  'SEN-10: whether the family wants support needs disclosed to schools at application stage. Governs what HHE''s team may share with a school — shown prominently on the family record.';
comment on column public.children.sen_additional_notes is
  'SEN-11, optional: anything about the child''s needs the family has never written down before.';

notify pgrst, 'reload schema';
