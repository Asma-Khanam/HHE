-- Addendum 65: OpenApply integration (read-only mirror of portal data)
-- Safe to re-run. HHE never pays or submits on the portal; this only stores a copy.

alter table public.applications
  add column if not exists openapply_student_id text,
  add column if not exists openapply_last_synced_at timestamptz,
  add column if not exists openapply_applied_at date;

create table if not exists public.application_checklist_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  title text not null,
  required boolean not null default false,
  status text not null default 'pending' check (status in ('pending','done')),
  completed_at date,
  file_count integer not null default 0,
  hhe_document_type text,
  external_ref text,
  source text not null default 'openapply_sync' check (source in ('staff','openapply_sync')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists application_checklist_items_ref_uq
  on public.application_checklist_items (application_id, external_ref)
  where external_ref is not null;

alter table public.application_checklist_items enable row level security;

drop policy if exists "staff manage checklist items" on public.application_checklist_items;
create policy "staff manage checklist items" on public.application_checklist_items
  for all using (public.is_staff()) with check (public.is_staff());

alter table public.application_fees
  add column if not exists child_id uuid,
  add column if not exists fee_type text,
  add column if not exists original_amount numeric(10,2),
  add column if not exists discount numeric(10,2),
  add column if not exists tax numeric(10,2),
  add column if not exists amount_paid numeric(10,2),
  add column if not exists portal_status text;

notify pgrst, 'reload schema';
