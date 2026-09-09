-- ============================================================================
-- Addendum 7 — 2026-09-07: per-family application email aliases
--
-- What this is for
-- ----------------
-- Lyndsey's problem: relocate@heatherharries.com can only be registered with
-- a given school admissions system once, so it can't be reused across
-- families. The fix is one unique, forwarding-only address per family —
-- smith4821@applications.heatherharries.com — that schools see as a real
-- inbox, but that actually forwards straight into relocate@heatherharries.com
-- and gets logged against the right family automatically.
--
-- This file only adds the CRM's side of that: a slug per family, an
-- active/inactive flag, and somewhere to log what came in. The actual mail
-- routing (the subdomain's DNS, Cloudflare Email Routing, the Worker that
-- calls log_application_email below) is infrastructure outside Supabase —
-- see the Worker script and setup steps that ship alongside this file.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendums 2, 3 and 5 first — this uses is_staff()
--   and the case_notes table they created.
-- ============================================================================

alter table public.families add column if not exists application_alias text unique;
alter table public.families add column if not exists application_alias_status text
  check (application_alias_status in ('active', 'inactive'));

comment on column public.families.application_alias is
  'The local part only, e.g. "smith4821" — the full address is <this>@applications.heatherharries.com. Generated once by staff, unique across every family so a school never sees a collision.';
comment on column public.families.application_alias_status is
  'active = the Email Worker forwards mail addressed here and logs it; inactive = the Worker still receives it (DNS is a catch-all, it can''t "un-exist" an address) but drops it instead of forwarding, and logs it as declined. Null means no alias has been generated yet.';

-- ----------------------------------------------------------------------------
-- case_notes gets two more optional columns so an inbound school email can be
-- logged as a normal case_notes row (kind='email' already existed) instead
-- of inventing a whole second timeline table.
-- ----------------------------------------------------------------------------
alter table public.case_notes add column if not exists subject text;
alter table public.case_notes add column if not exists direction text
  check (direction in ('inbound', 'outbound'));

comment on column public.case_notes.direction is
  'Set only on kind=''email'' rows created by the application-email pipeline. inbound = a school wrote to the family''s application alias; outbound is reserved for later if the CRM ever sends mail itself.';

-- ----------------------------------------------------------------------------
-- log_application_email — the one thing the Cloudflare Email Worker calls.
--
-- SECURITY DEFINER because the Worker authenticates with the service_role
-- key, not as a signed-in staff member — there's no auth.uid() to satisfy
-- is_staff() with. That's fine: this function does exactly one thing
-- (log an inbound email against the family that owns the alias) and nothing
-- else is exposed to the service_role caller through it.
--
-- Returns whether the Worker should actually forward the message on to
-- relocate@heatherharries.com. false covers both "no family has this alias"
-- (typo, spam, a stale/reused address) and "the alias is deliberately
-- inactive" — the Worker treats both the same way: log it, don't forward it.
-- ----------------------------------------------------------------------------
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
  v_family record;
begin
  select id, application_alias_status
  into v_family
  from public.families
  where application_alias = p_alias;

  if not found then
    return false;
  end if;

  insert into public.case_notes (family_id, kind, body, subject, direction, occurred_at)
  values (
    v_family.id,
    'email',
    coalesce(nullif(btrim(p_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || p_from,
    p_subject,
    'inbound',
    now()
  );

  return v_family.application_alias_status = 'active';
end;
$$;

-- Nobody signed in through the app should ever be able to call this directly
-- with an arbitrary family's alias and forge a case note — only the
-- service_role key (the Worker) can, because it bypasses RLS/grants
-- entirely. Revoke it from the anon/authenticated roles the two apps use,
-- explicitly, rather than relying on default privileges.
revoke execute on function public.log_application_email(text, text, text, text) from public, anon, authenticated;
