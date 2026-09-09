-- Addendum 24 (2026-09-09) — BUD-05 from Heather's "Questionnaire Change
-- Request v1.4": "Would you like us to talk you through the typical cost
-- of school and family life here?" Family-level, one of three fixed
-- answers (Yes please / No thank you / Maybe later).
--
-- The document asks that any answer other than "No thank you" flag the
-- family record for follow-up. The raw answer is saved plainly here so it's
-- filterable (`where cost_guidance_response <> 'No thank you'`); whether the
-- founders' portal surfaces that as a visible flag/badge on the Case panel
-- is a follow-up on that codebase, not this one — flagging it separately.

alter table public.families
  add column if not exists cost_guidance_response text;
