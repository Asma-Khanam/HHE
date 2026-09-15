-- ============================================================================
-- Addendum 49 — 2026-09-15: application-email logging also matches a
-- parent's own alias, not just the family-wide one
--
-- What this is for
-- ----------------
-- Addendum 7 gave every family one application alias
-- (families.application_alias) and log_application_email only ever checked
-- that table. Addendum 42 later gave each PARENT their own alias too
-- (parents.application_alias) — e.g. Aijaz has his own
-- aijaz...@applications.heatherharries.com, separate from the family-wide
-- one — but log_application_email was never updated to look there. A school
-- reply landing on a parent's own alias currently finds no match at all: it
-- isn't forwarded to relocate@heatherharries.com and never shows up
-- anywhere on the family's record, including the new Emails tab.
--
-- This is the fix: log_application_email now checks parents.application_alias
-- as well as families.application_alias, and logs the case note against
-- that parent's family either way. No schema change — just teaching the one
-- function to look in the second place it should have from the start.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Needs addendum 7 and 42 already applied.
-- ============================================================================

create or replace function public.log_application_email(
  p_alias text,
  p_from text,
  p_subject text,
  p_snippet text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_alias_status text;
begin
  -- Check the family-wide alias first (the common case), then fall back to
  -- a per-parent alias.
  select id, application_alias_status
  into v_family_id, v_alias_status
  from public.families
  where application_alias = p_alias;

  if not found then
    select family_id, application_alias_status
    into v_family_id, v_alias_status
    from public.parents
    where application_alias = p_alias;
  end if;

  if v_family_id is null then
    return false;
  end if;

  insert into public.case_notes (family_id, kind, body, subject, direction, occurred_at)
  values (
    v_family_id,
    'email',
    coalesce(nullif(btrim(p_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || p_from,
    p_subject,
    'inbound',
    now()
  );

  return v_alias_status = 'active';
end;
$$;

notify pgrst, 'reload schema';
