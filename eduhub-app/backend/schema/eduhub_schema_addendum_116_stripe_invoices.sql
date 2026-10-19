-- ============================================================================
-- Addendum 116 — 19 Oct 2026: the database side of the Stripe connection
--
-- Needs no Stripe key. It only adds tables and rules, so it is safe to run
-- before the founders hand over their Stripe details.
--
-- The money rules this enforces (so no money is lost or counted twice):
--   1. A record is only ever marked PAID by a verified Stripe event. Staff
--      and families cannot mark an invoiced record paid by hand through this.
--   2. The same Stripe event arriving twice (Stripe retries) is applied once:
--      stripe_events.id is the Stripe event id and is unique.
--   3. The amount Stripe says was paid is re-checked against the amount we
--      invoiced. If it differs, or the currency or live/test mode differs,
--      nothing is marked paid and the event is flagged for a person to look at.
--   4. Nothing is deleted. Every step is written to the accounting log.
--   5. Families can read their own invoice (amount charged, pay link) and
--      nothing else. What HHE paid the school is never on these tables.
--
-- What this adds:
--   families.stripe_customer_id     the family's customer in Stripe
--   parent_invoices                 one Stripe invoice per accounting record
--   stripe_events                   every Stripe event received, once each
--   prepare_record_invoice(...)     what to ask Stripe to charge (from the database)
--   record_stripe_invoice_created   saves the Stripe invoice and moves the record to invoiced
--   apply_stripe_invoice_paid       the only way a record becomes paid
--   void_record_invoice(...)        staff voids an unpaid invoice, record goes back to open
--
-- All functions below are for the server (service role) only, apart from
-- void_record_invoice which staff can call. Safe to re-run.
-- Run after addendum 115.
-- ============================================================================

alter table public.families add column if not exists stripe_customer_id text;
create unique index if not exists idx_families_stripe_customer
  on public.families(stripe_customer_id) where stripe_customer_id is not null;

-- 1. Invoices ------------------------------------------------------------------
create table if not exists public.parent_invoices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete restrict,
  record_id uuid not null references public.accounting_records(id) on delete restrict,
  stripe_invoice_id text not null unique,
  stripe_customer_id text,
  livemode boolean not null default false,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'AED',
  status text not null default 'open'
    check (status in ('open', 'paid', 'void', 'needs_review')),
  hosted_invoice_url text,
  invoice_pdf_url text,
  due_date date,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_parent_invoices_family on public.parent_invoices(family_id);
create index if not exists idx_parent_invoices_record on public.parent_invoices(record_id);
-- One live invoice per record: a second one can only be made after the first is voided.
create unique index if not exists idx_parent_invoices_one_live
  on public.parent_invoices(record_id) where status in ('open', 'paid', 'needs_review');

comment on table public.parent_invoices is
  'The Stripe invoice sent to a family for one accounting record. amount is what the family is charged (children x flat fee), never what HHE paid the school.';
comment on column public.parent_invoices.status is
  'open = sent, waiting; paid = a verified Stripe event confirmed the full amount; void = cancelled by staff; needs_review = Stripe reported a payment that did not match, a person must check.';

-- 2. Stripe events: each one recorded once -------------------------------------
create table if not exists public.stripe_events (
  id text primary key,                       -- Stripe's own event id (evt_...)
  type text not null,
  livemode boolean not null default false,
  stripe_invoice_id text,
  outcome text,                              -- paid, duplicate-never-stored, already_paid, unknown_invoice, amount_mismatch, ...
  needs_attention boolean not null default false,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_stripe_events_attention
  on public.stripe_events(received_at desc) where needs_attention;

-- 3. Row level security ---------------------------------------------------------
alter table public.parent_invoices enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists "parent_invoices_staff_read" on public.parent_invoices;
create policy "parent_invoices_staff_read" on public.parent_invoices
  for select using (public.is_staff());

drop policy if exists "parent_invoices_family_read" on public.parent_invoices;
create policy "parent_invoices_family_read" on public.parent_invoices
  for select using (family_id in (select id from public.families where account_user_id = auth.uid()));

drop policy if exists "stripe_events_staff_read" on public.stripe_events;
create policy "stripe_events_staff_read" on public.stripe_events
  for select using (public.is_staff());
-- No insert/update/delete policies on purpose: only the server (service role)
-- and the functions below ever write to these tables.

create or replace function public.parent_invoices_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists parent_invoices_touch on public.parent_invoices;
create trigger parent_invoices_touch
  before update on public.parent_invoices
  for each row execute function public.parent_invoices_touch();

-- 4. What to invoice, worked out by the database --------------------------------
create or replace function public.prepare_record_invoice(p_record_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.accounting_records%rowtype;
  v_total numeric(10,2);
  v_lines jsonb;
  v_email text;
  v_name text;
  v_customer text;
begin
  select * into v_rec from public.accounting_records where id = p_record_id;
  if not found then
    raise exception 'Accounting record not found.';
  end if;
  if v_rec.status <> 'open' then
    raise exception 'This record is already %, so it cannot be invoiced again.', v_rec.status;
  end if;
  if exists (select 1 from public.parent_invoices
             where record_id = p_record_id and status in ('open', 'paid', 'needs_review')) then
    raise exception 'This record already has an invoice.';
  end if;

  select coalesce(sum(i.amount_charged), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'child', coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(c.preferred_name), ''), nullif(btrim(c.first_name), ''), 'Child'),
           'amount', i.amount_charged) order by i.created_at), '[]'::jsonb)
    into v_total, v_lines
  from public.accounting_record_items i
  left join public.children c on c.id = i.child_id
  where i.record_id = p_record_id and i.removed_at is null;

  if v_total <= 0 then
    raise exception 'There is nothing to invoice on this record.';
  end if;

  select u.email into v_email
  from public.families f join auth.users u on u.id = f.account_user_id
  where f.id = v_rec.family_id;

  select p.full_name into v_name
  from public.parents p where p.family_id = v_rec.family_id
  order by p.created_at limit 1;

  select stripe_customer_id into v_customer from public.families where id = v_rec.family_id;

  return jsonb_build_object(
    'record_id', v_rec.id,
    'family_id', v_rec.family_id,
    'school_id', v_rec.school_id,
    'currency', v_rec.currency,
    'total', v_total,
    'lines', v_lines,
    'email', v_email,
    'name', v_name,
    'stripe_customer_id', v_customer
  );
end;
$$;
revoke execute on function public.prepare_record_invoice(uuid) from public, anon, authenticated;

-- 5. Save the Stripe invoice and move the record to "invoiced" -------------------
create or replace function public.record_stripe_invoice_created(
  p_record_id uuid,
  p_stripe_invoice_id text,
  p_stripe_customer_id text,
  p_livemode boolean,
  p_amount numeric,
  p_hosted_invoice_url text,
  p_invoice_pdf_url text,
  p_due_date date,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.accounting_records%rowtype;
  v_total numeric(10,2);
  v_id uuid;
begin
  select * into v_rec from public.accounting_records where id = p_record_id for update;
  if not found or v_rec.status <> 'open' then
    raise exception 'This record is not open, so the invoice was not saved.';
  end if;

  select coalesce(sum(amount_charged), 0) into v_total
  from public.accounting_record_items where record_id = p_record_id and removed_at is null;
  if round(v_total, 2) <> round(p_amount, 2) then
    raise exception 'The invoice amount (%) does not match the record (%).', p_amount, v_total;
  end if;

  insert into public.parent_invoices (
    family_id, record_id, stripe_invoice_id, stripe_customer_id, livemode, amount, currency,
    status, hosted_invoice_url, invoice_pdf_url, due_date, created_by
  ) values (
    v_rec.family_id, p_record_id, p_stripe_invoice_id, p_stripe_customer_id, p_livemode, v_total, v_rec.currency,
    'open', p_hosted_invoice_url, p_invoice_pdf_url, p_due_date, p_actor
  ) returning id into v_id;

  if p_stripe_customer_id is not null then
    update public.families set stripe_customer_id = p_stripe_customer_id
    where id = v_rec.family_id and stripe_customer_id is null;
  end if;

  update public.accounting_records set status = 'invoiced' where id = p_record_id;

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (p_record_id, v_rec.family_id, 'invoice_sent',
          jsonb_build_object('stripe_invoice_id', p_stripe_invoice_id, 'amount', v_total, 'currency', v_rec.currency),
          p_actor);

  return jsonb_build_object('invoice_id', v_id, 'amount', v_total);
end;
$$;
revoke execute on function public.record_stripe_invoice_created(uuid, text, text, boolean, numeric, text, text, date, uuid)
  from public, anon, authenticated;

-- 6. THE way a record becomes paid ------------------------------------------------
-- Called only by the verified Stripe webhook. Every outcome is stored.
create or replace function public.apply_stripe_invoice_paid(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_stripe_invoice_id text,
  p_amount_paid_minor bigint,
  p_currency text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_inv public.parent_invoices%rowtype;
  v_problem text;
begin
  insert into public.stripe_events (id, type, livemode, stripe_invoice_id, payload)
  values (p_event_id, p_event_type, p_livemode, p_stripe_invoice_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Stripe retried an event we already handled: do nothing.
  if v_inserted = 0 then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  select * into v_inv from public.parent_invoices
  where stripe_invoice_id = p_stripe_invoice_id for update;

  if not found then
    update public.stripe_events
       set outcome = 'unknown_invoice', needs_attention = true, processed_at = now(),
           detail = 'Stripe reported a payment for an invoice we have no record of.'
     where id = p_event_id;
    return jsonb_build_object('outcome', 'unknown_invoice', 'needs_attention', true);
  end if;

  if v_inv.status = 'paid' then
    update public.stripe_events set outcome = 'already_paid', processed_at = now() where id = p_event_id;
    return jsonb_build_object('outcome', 'already_paid');
  end if;

  if v_inv.status = 'void' then
    update public.stripe_events
       set outcome = 'paid_but_void', needs_attention = true, processed_at = now(),
           detail = 'Money arrived on an invoice that had been voided. Refund or reopen it.'
     where id = p_event_id;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_inv.record_id, v_inv.family_id, 'stripe_paid_on_void_invoice',
            jsonb_build_object('stripe_invoice_id', p_stripe_invoice_id, 'event_id', p_event_id), null);
    return jsonb_build_object('outcome', 'paid_but_void', 'needs_attention', true);
  end if;

  v_problem := case
    when p_livemode is distinct from v_inv.livemode then 'Live/test mode does not match the invoice.'
    when upper(coalesce(p_currency, '')) <> upper(v_inv.currency) then 'Currency does not match the invoice.'
    when p_amount_paid_minor is distinct from round(v_inv.amount * 100)::bigint then
      'Amount paid (' || coalesce(p_amount_paid_minor::text, 'none') || ') does not match the invoice (' || round(v_inv.amount * 100)::bigint || ') in minor units.'
    else null
  end;

  if v_problem is not null then
    update public.parent_invoices set status = 'needs_review' where id = v_inv.id;
    update public.stripe_events
       set outcome = 'mismatch', needs_attention = true, detail = v_problem, processed_at = now()
     where id = p_event_id;
    insert into public.accounting_events (record_id, family_id, kind, detail, actor)
    values (v_inv.record_id, v_inv.family_id, 'stripe_payment_mismatch',
            jsonb_build_object('stripe_invoice_id', p_stripe_invoice_id, 'event_id', p_event_id, 'problem', v_problem), null);
    return jsonb_build_object('outcome', 'mismatch', 'needs_attention', true, 'detail', v_problem);
  end if;

  -- All checks passed: this is a real, full payment.
  update public.parent_invoices set status = 'paid', paid_at = now() where id = v_inv.id;
  update public.accounting_records set status = 'paid', family_paid_at = now() where id = v_inv.record_id;
  update public.application_fees
     set status = 'paid', paid_at = coalesce(paid_at, now())
   where id in (select application_fee_id from public.accounting_record_items
                where record_id = v_inv.record_id and removed_at is null)
     and status <> 'paid';

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (v_inv.record_id, v_inv.family_id, 'family_paid',
          jsonb_build_object('stripe_invoice_id', p_stripe_invoice_id, 'event_id', p_event_id,
                             'amount', v_inv.amount, 'currency', v_inv.currency, 'via', 'stripe'), null);

  update public.stripe_events set outcome = 'paid', processed_at = now() where id = p_event_id;
  return jsonb_build_object('outcome', 'paid', 'record_id', v_inv.record_id, 'family_id', v_inv.family_id);
end;
$$;
revoke execute on function public.apply_stripe_invoice_paid(text, text, boolean, text, bigint, text, jsonb)
  from public, anon, authenticated;

-- 7. Staff voids an unpaid invoice (record goes back to open) -----------------------
-- The server also voids it in Stripe; this keeps our side in step. A paid invoice
-- can never be voided here.
create or replace function public.void_record_invoice(p_record_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.parent_invoices%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Only staff can void an invoice.';
  end if;

  select * into v_inv from public.parent_invoices
  where record_id = p_record_id and status in ('open', 'paid', 'needs_review') for update;
  if not found then
    raise exception 'There is no live invoice on this record.';
  end if;
  if v_inv.status = 'paid' then
    raise exception 'This invoice is already paid and cannot be voided.';
  end if;

  update public.parent_invoices set status = 'void' where id = v_inv.id;
  update public.accounting_records set status = 'open' where id = p_record_id and status = 'invoiced';

  insert into public.accounting_events (record_id, family_id, kind, detail, actor)
  values (p_record_id, v_inv.family_id, 'invoice_voided',
          jsonb_build_object('stripe_invoice_id', v_inv.stripe_invoice_id, 'reason', nullif(btrim(coalesce(p_reason, '')), '')),
          auth.uid());

  return jsonb_build_object('voided', v_inv.stripe_invoice_id);
end;
$$;
revoke execute on function public.void_record_invoice(uuid, text) from public, anon;
grant execute on function public.void_record_invoice(uuid, text) to authenticated;

notify pgrst, 'reload schema';
