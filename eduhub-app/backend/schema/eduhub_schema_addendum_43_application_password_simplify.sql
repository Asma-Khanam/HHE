-- ============================================================================
-- Addendum 43 — 2026-09-14: one generated password per application address,
-- not a login per school
--
-- What this is for
-- ----------------
-- Addendum 42 (same day) originally added a application_portal_credentials
-- table on the assumption staff would save a different login per school
-- portal. That was wrong — the actual ask from the founders is much
-- simpler: each application alias (the family-wide one from addendum 7, and
-- each parent's own from addendum 42) gets exactly ONE password, generated
-- once alongside the alias, shown next to it ready to copy-paste, and reused
-- as-is for every school that alias gets registered with. There's no
-- per-school variation to store.
--
-- This addendum:
--   1. adds application_password to families and parents, next to the
--      existing application_alias / application_alias_status columns;
--   2. drops application_portal_credentials entirely — addendum 42 shipped
--      it same-day, before any real row was ever saved into it (confirmed
--      empty), so there's nothing to migrate out of it.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendum 7 and addendum 42 first.
-- ============================================================================

alter table public.families add column if not exists application_password text;
alter table public.parents add column if not exists application_password text;

comment on column public.families.application_password is
  'Generated once, at the same time as application_alias — the one password staff register this family''s application address with on every school portal. Plain text, staff-only (same RLS as the rest of families already provides no client access to staff-managed columns beyond what the family form itself writes).';
comment on column public.parents.application_password is
  'Generated once, at the same time as this parent''s application_alias (addendum 42) — reused as-is across every school this parent''s address gets registered with.';

drop trigger if exists trg_portal_credentials_updated_at on public.application_portal_credentials;
drop function if exists public.set_portal_credentials_updated_at();
drop table if exists public.application_portal_credentials;

notify pgrst, 'reload schema';
