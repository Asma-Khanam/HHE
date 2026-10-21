-- ============================================================================
-- Addendum 125 — 21 Oct 2026: archive a family that decides not to move
--
-- Miss Lyndsay: "can we archive a family if they decide not to move?"
--
-- Nothing is deleted. An archived family keeps every email, note, document and
-- accounting record; it is only hidden from the working lists (Caseload,
-- Dashboard, Workload) and can be restored with one click.
--
--   families.archived_at / archived_reason / archived_by
--   archive_family(family, reason)   staff only; also leaves a note on the timeline
--   restore_family(family)           staff only; brings it back
--
-- Safe to re-run. Needs addendum 2 (is_staff).
-- HOW TO RUN: Supabase -> SQL Editor -> paste this whole file -> Run.
-- ============================================================================

alter table public.families add column if not exists archived_at timestamptz;
alter table public.families add column if not exists archived_reason text;
alter table public.families add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists idx_families_archived on public.families (archived_at) where archived_at is not null;

create or replace function public.archive_family(p_family uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;

  update public.families
     set archived_at = now(), archived_reason = v_reason, archived_by = auth.uid()
   where id = p_family and archived_at is null;
  if not found then
    raise exception 'That family was not found, or is already archived.';
  end if;

  insert into public.case_notes (family_id, kind, subject, body, occurred_at, author_id)
  values (p_family, 'note', 'Family archived',
          'Archived' || coalesce(': ' || v_reason, '') || '. Everything on their record is kept, and they can be restored from the Caseload (Archived tab).',
          now(), auth.uid());
end;
$$;
revoke execute on function public.archive_family(uuid, text) from public, anon;
grant execute on function public.archive_family(uuid, text) to authenticated;

create or replace function public.restore_family(p_family uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;

  update public.families
     set archived_at = null, archived_reason = null, archived_by = null
   where id = p_family and archived_at is not null;
  if not found then
    raise exception 'That family was not found, or is not archived.';
  end if;

  insert into public.case_notes (family_id, kind, subject, body, occurred_at, author_id)
  values (p_family, 'note', 'Family restored', 'Restored from the archive.', now(), auth.uid());
end;
$$;
revoke execute on function public.restore_family(uuid) from public, anon;
grant execute on function public.restore_family(uuid) to authenticated;

notify pgrst, 'reload schema';
