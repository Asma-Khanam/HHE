-- Addendum 22 (2026-09-09) — BUD-03 from Heather's "Questionnaire Change
-- Request v1.4": "What is your annual housing budget?" Family-level,
-- optional, single fixed answer — part of the Budget and relocation
-- planning section, alongside budget_status (BUD-01) and the AH-10 fee
-- range this section already reminds families of (BUD-02).

alter table public.families
  add column if not exists housing_budget text;
