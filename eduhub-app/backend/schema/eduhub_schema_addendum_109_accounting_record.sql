-- Addendum 109 (16 Oct 2026): the accounting record.
--
-- Miss Lyndsay's flowchart (15 Oct 2026): when HHE pays the school, an
-- accounting record opens with the school we paid, the children we paid for,
-- what we paid per child, what we charge per child, the difference, and
-- whether the family has paid. When the parent paid the school, nothing opens.
-- Miss Lyndsay (WhatsApp, 16 Oct): the 600 is a flat fee per child regardless
-- of the school's application fee.
--
-- What this adds (all staff-only, no family access at all):
--   accounting_settings       one row: the flat fee charged per child (600 AED)
--   accounting_records        one per school payment HHE makes for a family
--   accounting_record_items   one per child covered, with amount paid, amount
--                             charged and the difference worked out by the database
--   accounting_events         an append-only log of what happened and when
--
-- Why the amounts live in their own tables and not on application_fees:
-- the family can read their own fee rows, and what HHE paid the school and
-- what HHE earns on it must never be readable from the family side.
--
-- It opens by itself: ticking "HHE paid school" on the Application fee step
-- opens (or joins) the record for that family and school, so siblings paid in
-- one go share one record. Unticking is refused once a record has moved past
-- open. Nothing is deleted: a fee that leaves a record is marked removed, and
-- a record with no children left is marked void.
--
-- Safe to re-run. Run after addendum 108.

-- 1. Settings --------------------------------------------------------------
create table if not exists public.accounting_settings (
  id boolean primary key default true check (id),
  flat_fee_per_child numeric(10,2) not null default 600 check (flat_fee_per_child >= 0),
  currency text not null default 'AED',
  updated_at timestamptz not null default now()
);
insert into public.accounting_settings (id) values (true) on conflict (id) do nothing;

-- 2. Records ---------------------------------------------------------------
create table if not exists public.accounting_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete restrict,
  school_id uuid references public.schools(id) on delete set null,
  name text,
  status text not null default 'open'
    check (status in ('open', 'invoiced', 'paid', 'void')),
  school_payment_method text
    check (school_payment_method is null or school_payment_method in ('qashio', 'bank')),
  school_paid_at date,
  school_payment_reference text,
  currency text not null default 'AED',
  family_paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_accounting_records_family on public.accounting_records(family_id);
-- Only one open record per family and school, so siblings share it.
create unique index if not exists idx_accounting_records_one_open
  on public.accounting_records(family_id, school_id) where status = 'open';

comment on table public.accounting_records is
  'One per school payment HHE makes on a family''s behalf. Staff-only. status: open (school paid, not invoiced yet), invoiced, paid (family paid), void (nothing left on it).';

-- 3. Items: one per child covered -------------------------------------------
create table if not exists public.accounting_record_items (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.accounting_records(id) on delete restrict,
  application_fee_id uuid not null references public.application_fees(id) on delete restrict,
  child_id uuid references public.children(id) on delete set null,
  amount_paid numeric(10,2),
  amount_charged numeric(10,2) not null check (amount_charged >= 0),
  -- Worked out by the database, never typed. Null until the amount paid is known.
  difference numeric(10,2) generated always as (amount_charged - amount_paid) stored,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_accounting_items_record on public.accounting_record_items(record_id);
-- A fee can only be on one record at a time; a removed link frees it.
create unique index if not exists idx_accounting_items_one_live_per_fee
  on public.accounting_record_items(application_fee_id) where removed_at is null;

comment on column public.accounting_record_items.amount_paid is
  'What HHE paid the school for this child. Copied from the fee and kept in step while the record is open.';
comment on column public.accounting_record_items.amount_charged is
  'What HHE charges the family for this child. Starts at the flat fee in accounting_settings.';

-- 4. Events: append only ----------------------------------------------------
create table if not exists public.accounting_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.accounting_records(id) on delete restrict,
  family_id uuid references public.families(id) on delete restrict,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_accounting_events_record on public.accounting_events(record_id, created_at);

create or replace function public.accounting_events_no_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The accounting log cannot be edited or deleted.';
end;
$$;

drop trigger if exists accounting_events_append_only on public.accounting_events;
create trigger accounting_events_append_only
  before update or delete on public.accounting_events
  for each row execute function public.accounting_events_no_change();

-- 5. Row level security: staff only -------------------------------------------
alter table public.accounting_settings enable row level security;
alter table public.accounting_records enable row level security;
alter table public.accounting_record_items enable row level security;
alter table public.accounting_events enable row level security;

drop policy if exists "accounting_settings_staff_all" on public.accounting_settings;
create policy "accounting_settings_staff_all" on public.accounting_settings
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "accounting_records_staff_all" on public.accounting_records;
create policy "accounting_records_staff_all" on public.accounting_records
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "accounting_items_staff_all" on public.accounting_record_items;
create policy "accounting_items_staff_all" on public.accounting_record_items
  for all using (public.is_staff()) with check (public.is_staff());

-- The log: staff can read and add, nobody can edit or delete (the trigger above
-- also refuses it for everyone, including the service role).
drop policy if exists "accounting_events_staff_read" on public.accounting_events;
create policy "accounting_events_staff_read" on public.accounting_events
  for select using (public.is_staff());
drop policy if exists "accounting_events_staff_add" on public.accounting_events;
create policy "accounting_events_staff_add" on public.accounting_events
  for insert with check (public.is_staff());

-- 6. updated_at on records ------------------------------------------------------
create or replace function public.accounting_records_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists accounting_records_touch on public.accounting_records;
create trigger accounting_records_touch
  before update on public.accounting_records
  for each row execute function public.accounting_records_touch();

-- 7. Open / join / leave a record when "who paid" changes on an application fee ---
create or replace function public.accounting_sync_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school uuid;
  v_child uuid;
  v_family uuid;
  v_item public.accounting_record_items%rowtype;
  v_record uuid;
  v_status text;
  v_flat numeric(10,2);
  v_left int;
begin
  select a.school_id, a.child_id, c.family_id
    into v_school, v_child, v_family
  from public.applications a
  join public.children c on c.id = a.child_id
  where a.id = new.application_id;

  if v_family is null then
    return new;
  end if;

  select * into v_item
  from public.accounting_record_items
  where application_fee_id = new.id and removed_at is null;

  if new.hhe_paid_school_on_behalf and not new.paid_direct_by_family then
    if v_item.id is null then
      -- Join the open record for this family and school, or open one.
      select id into v_record
      from public.accounting_records
      where family_id = v_family and school_id is not distinct from v_school and status = 'open'
      limit 1;

      if v_record is null then
        insert into public.accounting_records (family_id, school_id, currency, created_by)
        values (v_family, v_school, coalesce(new.currency, 'AED'), auth.uid())
        returning id into v_record;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_record, v_family, 'record_opened', jsonb_build_object('fee_id', new.id), auth.uid());
      end if;

      select flat_fee_per_child into v_flat from public.accounting_settings where id;

      insert into public.accounting_record_items (record_id, application_fee_id, child_id, amount_paid, amount_charged)
      values (v_record, new.id, v_child, new.amount, coalesce(v_flat, 600));
      insert into public.accounting_events (record_id, family_id, kind, detail, actor)
      values (v_record, v_family, 'child_added',
              jsonb_build_object('fee_id', new.id, 'child_id', v_child, 'amount_paid', new.amount, 'amount_charged', coalesce(v_flat, 600)),
              auth.uid());
    else
      -- Already on a record: keep the amount paid in step while it is still open.
      select status into v_status from public.accounting_records where id = v_item.record_id;
      if v_status = 'open' and v_item.amount_paid is distinct from new.amount then
        update public.accounting_record_items set amount_paid = new.amount where id = v_item.id;
        insert into public.accounting_events (record_id, family_id, kind, detail, actor)
        values (v_item.record_id, v_family, 'amount_paid_changed',
                jsonb_build_object('fee_id', new.id, 'from', v_item.amount_paid, 'to', new.amount),
                auth.uid());
      end if;
    end if;

  elsif v_item.id is not null and new.status <> 'paid' then
    -- Moved away from "HHE paid the school" (and not simply settled by the family).
    select status into v_status from public.accounting_records where id = v_item.record_id;
    if v_status <> 'open' then
      raise exception 'This fee is already on an invoice. Void the invoice before changing who paid the school.';
    end if;

    update public.accounting_record_items set removed_at = now() where id = v_item.id;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_item.record_id, v_family, 'child_removed', jsonb_build_object('fee_id', new.id), auth.uid());

    select count(*) into v_left
    from public.accounting_record_items where record_id = v_item.record_id and removed_at is null;
    if v_left = 0 then
      update public.accounting_records set status = 'void' where id = v_item.record_id;
      insert into public.accounting_events (record_id, family_id, kind, detail, actor)
      values (v_item.record_id, v_family, 'record_void', jsonb_build_object('reason', 'no children left'), auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_sync_fee on public.application_fees;
create trigger accounting_sync_fee
  after insert or update of hhe_paid_school_on_behalf, paid_direct_by_family, amount, status
  on public.application_fees
  for each row execute function public.accounting_sync_fee();

-- 8. Catch up fees already marked "HHE paid the school" ---------------------------
-- Touching the column fires the trigger above. Nothing about the fee changes.
update public.application_fees
set hhe_paid_school_on_behalf = hhe_paid_school_on_behalf
where hhe_paid_school_on_behalf and not paid_direct_by_family;

notify pgrst, 'reload schema';
