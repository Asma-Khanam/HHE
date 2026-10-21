-- Addendum 123 (21 Oct 2026): Stripe invoices for registration deposits.
--
-- The invoice button, pay link, paid webhook and the family's Invoices card
-- already work for a deposit record (checked: a deposit item has no application
-- fee behind it, so the proof check and the "mark fees paid" step simply skip it).
-- What was wrong: the invoice Stripe sends said "school application support" for
-- every record. prepare_record_invoice now also returns the record's kind and the
-- school's name so the server can word the invoice properly, and a line with no
-- child comes back as null instead of the made-up name "Child".
--
-- Same rules as addendum 117 otherwise. Safe to re-run.

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
  v_school text;
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

  -- Never invoice a record we cannot back up (addendum 117).
  if v_rec.school_payment_method is null or v_rec.school_paid_at is null then
    raise exception 'Add how and when we paid the school before invoicing.';
  end if;
  if exists (select 1 from public.accounting_record_items
             where record_id = p_record_id and removed_at is null and amount_paid is null) then
    raise exception 'Add what we paid the school for every child before invoicing.';
  end if;
  if exists (select 1 from public.accounting_record_items i
             join public.application_fees f on f.id = i.application_fee_id
             where i.record_id = p_record_id and i.removed_at is null and f.payment_proof_path is null) then
    raise exception 'Attach proof of payment for every child before invoicing.';
  end if;

  select coalesce(sum(i.amount_charged), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'child', coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(c.preferred_name), ''), nullif(btrim(c.first_name), '')),
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

  select name into v_school from public.schools where id = v_rec.school_id;

  select stripe_customer_id into v_customer from public.families where id = v_rec.family_id;

  return jsonb_build_object(
    'record_id', v_rec.id,
    'family_id', v_rec.family_id,
    'school_id', v_rec.school_id,
    'kind', v_rec.kind,
    'school_name', v_school,
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

notify pgrst, 'reload schema';
