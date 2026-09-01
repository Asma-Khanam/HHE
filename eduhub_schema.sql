-- ============================================================================
-- Eduhub Data Model — initial schema
-- Heather Harries Education Hub / Learn with Eduhub Project
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.
--
-- Matches the "Eduhub Data Model" diagram: auth.users -> families -> (parents,
-- children) -> (current_schools, applications) -> schools, with every file
-- (passports, reports, EHCPs, references, etc.) attached through the single
-- `documents` table instead of a separate file column per document type.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- families — one row per signed-up account (email + password sign-up)
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  account_user_id uuid not null references auth.users(id) on delete cascade,
  home_address text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_families_account_user on public.families(account_user_id);

-- ----------------------------------------------------------------------------
-- parents — up to 2 per family
-- ----------------------------------------------------------------------------
create table if not exists public.parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  nationality text,
  religion text,
  first_language text,
  second_language text,
  employer_name text,
  occupation_designation text,
  eid text,
  created_at timestamptz not null default now()
);
create index if not exists idx_parents_family on public.parents(family_id);

-- ----------------------------------------------------------------------------
-- children — any number per family
-- ----------------------------------------------------------------------------
create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  nationality text,
  religion text,
  first_language text,
  second_language text,
  medical_inclusion_needs text,
  sports_hobbies_interests text,
  eid text,
  created_at timestamptz not null default now()
);
create index if not exists idx_children_family on public.children(family_id);

-- ----------------------------------------------------------------------------
-- current_schools — one row per child, tracks the confidential-reference flow
-- ----------------------------------------------------------------------------
create table if not exists public.current_schools (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  school_name text,
  school_address text,
  contact_email text,
  reference_status text not null default 'not_requested'
    check (reference_status in ('not_requested', 'requested', 'received')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- schools — catalog of target/prospective schools
-- ----------------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- applications — a child applying to a school
-- ----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  status text not null default 'draft'
    check (status in (
      'draft', 'submitted', 'documents_pending', 'reference_requested',
      'under_review', 'offer', 'rejected', 'withdrawn'
    )),
  submitted_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_applications_child on public.applications(child_id);
create index if not exists idx_applications_school on public.applications(school_id);

-- ----------------------------------------------------------------------------
-- documents — every file, attached polymorphically to a parent, child, or
-- application. No direct FK on owner_id (can't point at 3 tables at once in
-- plain Postgres) — integrity is enforced by the RLS policy function below.
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('parent', 'child', 'application')),
  owner_id uuid not null,
  document_type text not null,
  file_url text,
  -- file_type/original_filename are metadata only — they do NOT restrict what a
  -- client can upload. Any file type (image, PDF, Word doc, etc.) is allowed;
  -- these just record what was actually uploaded so the UI can show the right
  -- icon/preview and so the team can sanity-check what came in.
  file_type text,
  original_filename text,
  status text not null default 'pending'
    check (status in ('pending', 'received', 'verified')),
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_owner on public.documents(owner_type, owner_id);

-- ============================================================================
-- Row Level Security — every table starts locked down: a signed-in user can
-- only read/write rows that belong to their own family. `schools` is a shared
-- catalog (everyone signed in can read it; nobody can write it from the app —
-- write access needs the service_role key, used server-side by your own team
-- tooling, not the anon key the app uses).
-- ============================================================================

alter table public.families        enable row level security;
alter table public.parents         enable row level security;
alter table public.children        enable row level security;
alter table public.current_schools enable row level security;
alter table public.schools         enable row level security;
alter table public.applications    enable row level security;
alter table public.documents       enable row level security;

drop policy if exists "families_owner_all" on public.families;
create policy "families_owner_all" on public.families
  for all
  using (auth.uid() = account_user_id)
  with check (auth.uid() = account_user_id);

drop policy if exists "parents_owner_all" on public.parents;
create policy "parents_owner_all" on public.parents
  for all
  using (family_id in (select id from public.families where account_user_id = auth.uid()))
  with check (family_id in (select id from public.families where account_user_id = auth.uid()));

drop policy if exists "children_owner_all" on public.children;
create policy "children_owner_all" on public.children
  for all
  using (family_id in (select id from public.families where account_user_id = auth.uid()))
  with check (family_id in (select id from public.families where account_user_id = auth.uid()));

drop policy if exists "current_schools_owner_all" on public.current_schools;
create policy "current_schools_owner_all" on public.current_schools
  for all
  using (child_id in (
    select c.id from public.children c
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ))
  with check (child_id in (
    select c.id from public.children c
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ));

drop policy if exists "applications_owner_all" on public.applications;
create policy "applications_owner_all" on public.applications
  for all
  using (child_id in (
    select c.id from public.children c
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ))
  with check (child_id in (
    select c.id from public.children c
    join public.families f on f.id = c.family_id
    where f.account_user_id = auth.uid()
  ));

drop policy if exists "schools_read_all" on public.schools;
create policy "schools_read_all" on public.schools
  for select
  using (auth.role() = 'authenticated');

-- Helper used by the documents policy below: is the signed-in user the owner
-- of whatever this document is attached to?
create or replace function public.user_owns_document(p_owner_type text, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_owner_type
    when 'parent' then exists (
      select 1 from public.parents p
      join public.families f on f.id = p.family_id
      where p.id = p_owner_id and f.account_user_id = auth.uid()
    )
    when 'child' then exists (
      select 1 from public.children c
      join public.families f on f.id = c.family_id
      where c.id = p_owner_id and f.account_user_id = auth.uid()
    )
    when 'application' then exists (
      select 1 from public.applications a
      join public.children c on c.id = a.child_id
      join public.families f on f.id = c.family_id
      where a.id = p_owner_id and f.account_user_id = auth.uid()
    )
    else false
  end;
$$;

drop policy if exists "documents_owner_all" on public.documents;
create policy "documents_owner_all" on public.documents
  for all
  using (public.user_owns_document(owner_type, owner_id))
  with check (public.user_owns_document(owner_type, owner_id));

-- ============================================================================
-- Done. Quick check — should list all 8 tables with rowsecurity = true:
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- ============================================================================


-- ============================================================================
-- Addendum — 2026-08-25: file-type clarification
--
-- The table already allowed ANY file type — file_url is a plain text column
-- with no restriction on what it points to, and document_type was never
-- restricted to a fixed list either. Nothing was actually blocking images,
-- PDFs, or Word docs.
--
-- What file type gets accepted is controlled by the Supabase Storage BUCKET
-- you upload into, not this table. A newly-created bucket accepts any file
-- type by default — you'd only see a restriction if "Allowed MIME types" was
-- specifically set on the bucket. Worth checking that setting is left open
-- (or explicitly includes image/*, application/pdf, and the Word doc types)
-- when the bucket for these uploads gets created.
--
-- This addendum only adds two optional metadata columns — safe to re-run,
-- and safe on a table that already has the earlier version of `documents`.
-- ============================================================================

alter table public.documents add column if not exists file_type text;
alter table public.documents add column if not exists original_filename text;

comment on column public.documents.file_type is
  'MIME type of the uploaded file, e.g. image/jpeg, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document. Informational only — does not restrict uploads.';
comment on column public.documents.original_filename is
  'The filename as uploaded by the client, kept for display/reference.';


-- ============================================================================
-- Addendum — 2026-08-26: link the signed-up account to its actual parent
--
-- Most of the time exactly one parent (e.g. the mother) creates the account
-- AND is one of the two parents on file — the schema didn't capture that
-- explicitly before. families.account_user_id still says who owns/administers
-- the family (every RLS policy still relies on it, unchanged by this). This
-- addendum adds a direct link so the app can tell which specific parent row
-- IS the person logged in — e.g. to pre-fill her own info, greet her by name,
-- or let her edit her own profile without guessing which row is hers.
--
-- The second parent (if any) simply has user_id = NULL — entered as
-- information, but they never created their own login. Expected, not an error.
-- No RLS changes needed — the existing families-based policy already covers
-- this column like every other one on the table.
-- ============================================================================

alter table public.parents add column if not exists user_id uuid unique references auth.users(id);

comment on column public.parents.user_id is
  'Set only for the parent who actually created the account (matches auth.users.id). NULL for a parent entered as information only, who never signed up themselves.';

-- ============================================================================
-- Addendum — 2026-08-27: real draft/submitted status for the intake form
--
-- Until now "Save application" always required every required (*) field to
-- be filled before anything could be saved at all — so a family that got
-- halfway through and closed the tab had nothing saved. This splits the form
-- into two real actions: "Save draft" (saves whatever is filled, no
-- validation) and "Submit application" (validates first, then saves and
-- marks it submitted). This column is what "submitted" actually means —
-- separate from `applications.status`, which tracks a specific child's
-- application to a specific target school later in the flow (a
-- not-yet-built feature); this one tracks the intake form itself, which
-- every family fills out regardless of which school they end up applying to.
-- ============================================================================

alter table public.families add column if not exists intake_status text not null default 'draft'
  check (intake_status in ('draft', 'submitted'));
alter table public.families add column if not exists intake_submitted_at timestamptz;

comment on column public.families.intake_status is
  'Whether this family has clicked "Submit application" yet. Defaults to draft on every new family. Distinct from applications.status, which is per child-per-school.';

-- ============================================================================
-- Addendum — 2026-08-27: Mother / Father instead of one generic "Parent"
--
-- The form used to treat "the parent" as a single anonymous role. Real
-- families are a Mother and (optionally) a Father, and whichever one of them
-- actually creates the account should read as that — "Mother (Account
-- holder)" — rather than just "Parent". This column is what makes that
-- possible: every row in `parents` now says which of the two it is.
--
-- Both rows are always created for a family (one may be entirely blank
-- except relationship + full_name if the family only has one parent on
-- file) — this is NOT a free-for-all list of parents, it's exactly two
-- fixed roles, same as the diagram: Mother <-> Father -> Child 1, Child 2...
-- ============================================================================

alter table public.parents add column if not exists relationship text
  check (relationship in ('Mother', 'Father'));

comment on column public.parents.relationship is
  'Mother or Father. Whichever row''s relationship matches the account holder''s own chosen role (set at the top of the Parent step) is the one that gets user_id and shows as "(Account holder)" in the app.';

-- ============================================================================
-- Force the API to notice the changes above right away — 2026-08-27
--
-- Supabase's API layer (PostgREST) caches the table schema and doesn't
-- always notice a column added via raw SQL until it refreshes on its own.
-- This tells it to refresh immediately instead of waiting, which is what
-- was actually missing before (the app started saying "Could not find the
-- 'user_id' column of 'parents' in the schema cache" even after the column
-- existed). Safe to run any time, including when nothing changed.
-- ============================================================================

NOTIFY pgrst, 'reload schema';
