-- ============================================================================
-- Eduhub — FULL reset for a clean end-to-end test
-- Heather Harries Education Hub / Learn with Eduhub Project
--
-- WHAT THIS DOES: wipes every family's data — parents, children, current
-- schools, applications, and document records — AND deletes every signed-up
-- auth account, so you can sign up again with the same email and get a
-- completely fresh family (a brand-new auth.users row, so nothing "sees"
-- your old test data at all).
--
-- THIS IS IRREVERSIBLE. Only run this in a dev/test project you're happy to
-- empty out — not against real submitted applications. Since this is the
-- "Learn with Eduhub Project" you've been testing in, that should be exactly
-- what you want right now, but double-check you're in the right Supabase
-- project before running it (top-left project switcher).
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--
-- ONE STEP THIS FILE CANNOT DO FOR YOU: Supabase deliberately blocks direct
-- SQL deletes on storage.objects ("Direct deletion from storage tables is
-- not allowed. Use the Storage API instead.") — a built-in guardrail against
-- accidentally orphaning files, and there's no way around it from SQL. So
-- clear the actual uploaded files yourself first, from the dashboard:
--   Storage (left sidebar) → the `documents` bucket → select all → Delete.
-- Do that BEFORE running the rest of this file (order doesn't strictly
-- matter, but it's one less thing to remember afterwards).
-- ============================================================================

-- Every document checklist row (passports, EIDs, school reports, etc.) —
-- no FK cascade reaches this table since owner_id is polymorphic, so it
-- has to be cleared explicitly or rows would be orphaned.
delete from public.documents;

-- Not used by the client app yet, but included for a truly clean slate.
delete from public.applications;

-- children/current_schools/parents/families all cascade from families via
-- their own FKs, and families cascades from auth.users — so deleting the
-- auth accounts below would clear all four automatically. Deleting them
-- explicitly here too is just belt-and-braces (also handles any leftover
-- family row that somehow lost its auth link).
delete from public.current_schools;
delete from public.children;
delete from public.parents;
delete from public.families;

-- Every signed-up account. After this, sign-up with your usual email will
-- create a brand-new account (and Supabase will send a fresh confirmation
-- email, same as the very first time). If this line also gets blocked the
-- same way storage.objects was, delete accounts from the dashboard instead:
-- Authentication → Users → select all → Delete users.
delete from auth.users;
