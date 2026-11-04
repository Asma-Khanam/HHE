-- Addendum 152 (04 Nov 2026): the family is told when an invoice is sent to
-- their dashboard and when the consultant asks them for a document, and the
-- client app gets new notifications live (no reload needed).
--
--  * invoice_sent        : staff pressed "Send to family dashboard" on a fee
--  * document_requested  : staff logged a "Document requested" update on an
--                          application (the text they typed is the message)
--  * family_notifications joins the realtime publication so the bell and the
--    inbox update the moment a row is added or changed.
--
-- Needs addenda 136, 137, 138, 140. Safe to re-run.

-- 1) Let the two new kinds through the inbox's CHECK constraint. ------------
alter table public.family_notifications drop constraint if exists family_notifications_kind_check;
alter table public.family_notifications add constraint family_notifications_kind_check
  check (kind in (
    'tour_scheduled', 'tour_updated', 'tour_cancelled',
    'assessment_scheduled', 'assessment_updated',
    'school_update',
    'tour_reminder_day', 'tour_reminder_hours',
    'assessment_reminder_day', 'assessment_reminder_hours',
    'invoice_sent', 'document_requested'
  ));

-- 2) Invoice sent to the family dashboard. ----------------------------------
create or replace function public.notify_family_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_school_id uuid;
  v_school text;
  v_child text;
  v_details jsonb := '[]'::jsonb;
  v_amount text;
  v_body text;
begin
  if new.sent_to_family_at is null or new.status <> 'unpaid' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.sent_to_family_at is not distinct from new.sent_to_family_at then
    return new;
  end if;

  select c.family_id, a.school_id,
         coalesce(nullif(btrim(c.preferred_name), ''), c.first_name)
    into v_family, v_school_id, v_child
    from public.applications a
    join public.children c on c.id = a.child_id
   where a.id = new.application_id;
  if v_family is null then
    return new;
  end if;

  -- Same invoice re-sent within a few minutes: once is enough.
  if exists (
    select 1 from public.family_notifications n
     where n.family_id = v_family and n.kind = 'invoice_sent' and n.source_id = new.id
       and n.created_at > now() - interval '5 minutes'
  ) then
    return new;
  end if;

  select s.name into v_school from public.schools s where s.id = v_school_id;
  v_school := coalesce(v_school, 'the school');

  v_amount := case when new.amount is null then null
                   else new.currency || ' ' || to_char(new.amount, 'FM999,999,990.00') end;

  v_details := public._notif_detail(v_details, 'Invoice', new.label);
  v_details := public._notif_detail(v_details, 'Amount', v_amount);
  v_details := public._notif_detail(v_details, 'Child', v_child);
  v_details := public._notif_detail(v_details, 'Due date',
    case when new.due_date is null then null else to_char(new.due_date, 'FMDay DD FMMonth YYYY') end);
  v_details := public._notif_detail(v_details, 'Pay now', new.payment_url);

  v_body := 'A new invoice for ' || v_school || ' is ready in your Billing tab.';

  insert into public.family_notifications
    (family_id, school_id, school_name, kind, title, body, details, source_id, event_date)
  values
    (v_family, v_school_id, v_school, 'invoice_sent',
     'Invoice: ' || v_school, v_body, v_details, new.id, new.due_date);
  return new;
end;
$$;
revoke all on function public.notify_family_invoice() from public;

drop trigger if exists application_fees_notify_family_trg on public.application_fees;
create trigger application_fees_notify_family_trg
  after insert or update on public.application_fees
  for each row execute function public.notify_family_invoice();

-- 3) Document requested by the consultant. ----------------------------------
create or replace function public.notify_family_document_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_school_id uuid;
  v_school text;
  v_child text;
  v_details jsonb := '[]'::jsonb;
begin
  if new.event_type <> 'document_requested' or new.source <> 'staff' then
    return new;
  end if;

  select c.family_id, a.school_id,
         coalesce(nullif(btrim(c.preferred_name), ''), c.first_name)
    into v_family, v_school_id, v_child
    from public.applications a
    join public.children c on c.id = a.child_id
   where a.id = new.application_id;
  if v_family is null then
    return new;
  end if;

  select s.name into v_school from public.schools s where s.id = v_school_id;
  v_school := coalesce(v_school, 'the school');

  v_details := public._notif_detail(v_details, 'Message', new.description);
  v_details := public._notif_detail(v_details, 'Child', v_child);

  insert into public.family_notifications
    (family_id, school_id, school_name, kind, title, body, details, source_id)
  values
    (v_family, v_school_id, v_school, 'document_requested',
     'Document needed: ' || v_school, new.description, v_details, new.id);
  return new;
end;
$$;
revoke all on function public.notify_family_document_request() from public;

drop trigger if exists application_events_notify_family_doc_trg on public.application_events;
create trigger application_events_notify_family_doc_trg
  after insert on public.application_events
  for each row execute function public.notify_family_document_request();

-- 4) Live updates for the client app. ---------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.family_notifications;
exception
  when duplicate_object then null;   -- already in the publication
  when undefined_object then null;   -- no realtime publication on this project
end $$;

notify pgrst, 'reload schema';
