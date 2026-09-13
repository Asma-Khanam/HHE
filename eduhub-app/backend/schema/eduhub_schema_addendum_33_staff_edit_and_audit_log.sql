-- ============================================================================
-- Addendum 33 — staff can edit a family's submitted answers, with a change
-- history (September 2026 change request, via WhatsApp): "they also wanted
-- to be able to edit all these submissions from their own end... but also be
-- able to keep track of who was making what changes, version history typpa
-- thing would be nice here right?"
--
-- Two things:
--   1. Staff could already READ parents/children/current_schools (addendum
--      2) and already had full read+write on families (addendum 2 & 3), but
--      had no write access at all to parents/children/current_schools — the
--      founders app's field grids were display-only for exactly that reason.
--      This adds the missing update policies, same shape as staff_update_
--      families in addendum 3.
--   2. record_audit_log — one row per changed field, written by the app
--      itself (see founders/src/lib/staffData.js's logAuditChanges) right
--      after a save. Append-only: no update or delete policy exists for
--      this table at all, so once written a row can't be edited or removed
--      by anyone, staff included, through the app or the anon key.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Staff write access to the family's own answers
-- ----------------------------------------------------------------------------

drop policy if exists "staff_update_parents" on public.parents;
create policy "staff_update_parents" on public.parents
  for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "staff_update_children" on public.children;
create policy "staff_update_children" on public.children
  for update
  using (public.is_staff())
  with check (public.is_staff());

-- current_schools rows: staff also need to be able to CREATE one (a child
-- who never got this far on the family's own form still needs a school
-- record for staff to fill in), not just update an existing one.
drop policy if exists "staff_write_current_schools" on public.current_schools;
create policy "staff_write_current_schools" on public.current_schools
  for all
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 2. Change history
-- ----------------------------------------------------------------------------

create table if not exists public.record_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized onto every row so "everything that changed on this family"
  -- is one indexed query, whichever table the edit actually touched.
  family_id uuid references public.families(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  field_name text not null,
  field_label text,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  -- The name at the time of the change, kept even if that staff member
  -- later leaves the team and their staff row (or even their login) is gone.
  changed_by_name text,
  changed_at timestamptz not null default now()
);

comment on table public.record_audit_log is
  'Append-only history of edits staff make to a family''s own submitted answers (parents/children/current_schools). One row per changed field. Never updated or deleted once written — see the absence of any such policy below.';

create index if not exists record_audit_log_family_idx on public.record_audit_log (family_id, changed_at desc);

alter table public.record_audit_log enable row level security;

drop policy if exists "staff_read_audit_log" on public.record_audit_log;
create policy "staff_read_audit_log" on public.record_audit_log
  for select
  using (public.is_staff());

-- A staff member can only ever log a change as themselves — changed_by has
-- to be their own auth.uid(), so nobody can write a history entry that
-- claims to be someone else's edit.
drop policy if exists "staff_insert_audit_log" on public.record_audit_log;
create policy "staff_insert_audit_log" on public.record_audit_log
  for insert
  with check (public.is_staff() and changed_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Tell PostgREST about all of the above right away.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
