-- ============================================================================
-- Addendum 42 — 2026-09-14: per-parent application aliases + school portal
-- login storage
--
-- What this is for
-- ----------------
-- Addendum 7 gave each FAMILY one disposable application-email alias
-- (application_alias on public.families). The founders have since asked for
-- one per PARENT instead — a lot of school admissions portals want a
-- separate login for the mother and the father when both are named on an
-- application, and staff now also need somewhere to store the login (the
-- alias email + whatever password got set on that specific school's portal)
-- so the team can go back into the same portal account later — for a
-- decision email, a document request, a follow-up — instead of resetting
-- the password or re-registering from scratch each time.
--
-- This does NOT remove or change the addendum 7 family-level alias — that
-- column, and everything built on it, stays exactly as it was. This adds a
-- second, independent alias per parent row, plus a new table for the portal
-- credentials tied to whichever alias (family-level or parent-level) was
-- used to register with that school.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Run addendum 2 (is_staff) and addendum 7 (the alias
--   pattern this mirrors) first if this is a fresh project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- One application alias per PARENT, mirroring families.application_alias
-- from addendum 7 exactly (same unique/local-part/status shape), just scoped
-- to a single parent row instead of the whole family. A family with a
-- Mother row and a Father row can now generate up to two addresses — one
-- for each parent's own portal registration.
-- ----------------------------------------------------------------------------
alter table public.parents add column if not exists application_alias text unique;
alter table public.parents add column if not exists application_alias_status text
  check (application_alias_status in ('active', 'inactive'));

comment on column public.parents.application_alias is
  'The local part only, e.g. "smith4821m" — the full address is <this>@applications.heatherharries.com. One per parent row, separate from and in addition to the family-wide application_alias on the families table (addendum 7). Generated once by staff, unique across every parent so a school never sees a collision.';
comment on column public.parents.application_alias_status is
  'Same meaning as families.application_alias_status (addendum 7): active = registered with a school and expected to receive mail; inactive = kept for the record but no longer in active use. Null means no alias generated yet for this parent.';

-- ----------------------------------------------------------------------------
-- application_portal_credentials — where staff store the login a family or
-- parent's alias was registered with on a school's own admissions portal.
-- Not every school sends everything by email — many require staff to log
-- back into a portal account directly to see a decision or upload a
-- document, so this is what makes that repeatable without staff having to
-- remember or re-find a password each time.
--
-- Linked to family_id always, and to parent_id only when the login was
-- created against a specific parent's own alias rather than the family-wide
-- one — so this covers both addendum 7's family alias and this addendum's
-- parent aliases without duplicating the table.
-- ----------------------------------------------------------------------------
create table if not exists public.application_portal_credentials (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  parent_id uuid references public.parents(id) on delete cascade,
  school_name text not null,
  portal_url text,
  login_email text not null,
  login_password text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table public.application_portal_credentials is
  'Login details staff created on a school''s own admissions portal, using a family or parent application alias as the login email. Staff-only, never exposed to the family-facing app. Note: login_password is stored as plain text, protected only by this table''s staff-only RLS policy below — the same trust boundary the rest of this schema already relies on for other sensitive data (documents, payments), not field-level encryption. If that ever needs to be stronger, encrypt this column (e.g. pgcrypto) before relying on it for anything beyond internal school-portal logins.';
comment on column public.application_portal_credentials.parent_id is
  'Set when this login was created against a specific parent''s own alias (this addendum). Left null when it was created against the family-wide alias from addendum 7 instead.';

create index if not exists application_portal_credentials_family_id_idx
  on public.application_portal_credentials(family_id);
create index if not exists application_portal_credentials_parent_id_idx
  on public.application_portal_credentials(parent_id);

alter table public.application_portal_credentials enable row level security;

-- Staff only, full stop — no family/client role should ever see a stored
-- password, so unlike most tables in this schema there is no client-facing
-- select policy here at all.
drop policy if exists "portal_credentials_staff_all" on public.application_portal_credentials;
create policy "portal_credentials_staff_all" on public.application_portal_credentials
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- Keeps updated_at/updated_by honest without every call site having to
-- remember to set them by hand.
create or replace function public.set_portal_credentials_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_portal_credentials_updated_at on public.application_portal_credentials;
create trigger trg_portal_credentials_updated_at
  before update on public.application_portal_credentials
  for each row execute function public.set_portal_credentials_updated_at();

notify pgrst, 'reload schema';
