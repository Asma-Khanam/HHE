-- Addendum 21 (2026-09-09) — BUD-01 from Heather's "Questionnaire Change
-- Request v1.4", the first question of the new Section 3, "Budget and
-- relocation planning": "Have you set a budget for the move?" Family-level,
-- single fixed answer, so this team can tell how to open the money
-- conversation before they ever speak to the family.

alter table public.families
  add column if not exists budget_status text;
