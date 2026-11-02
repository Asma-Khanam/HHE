-- Addendum 150 (2 Nov 2026): record the changes nothing was recording.
--
-- The Activity page merges every trail the database already keeps. Building it
-- showed what has no trail at all: tour dates and statuses, availability
-- replies, a fee marked paid or waived, documents arriving or going, a school
-- added to or taken off a shortlist, and edits to a task. None of those could
-- ever say who did them.
--
-- One trigger function handles all of it, writing to record_audit_log -- the
-- same append-only table staff edits already use (addendum 33), so the page
-- reads one place and nothing new has to be kept in step. The function is
-- security definer because that table's insert policy only lets a staff member
-- write a row as themselves; the trigger writes on their behalf, and still
-- stamps auth.uid(), so nobody gains a way to write under another name.
--
-- Only the listed columns are watched, so ordinary bookkeeping columns
-- (updated_at and the like) never fill the feed. A change made by a schedule
-- or by the family's own app has no login behind it and is recorded with no
-- name, which the page shows as "Not recorded".
--
-- Nothing is deleted and nothing existing changes. Safe to re-run.
-- Needs addenda 33, 36, 60 and 70.

create or replace function public.audit_watched_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row         jsonb;
  v_old         jsonb;
  v_family      uuid;
  v_record      uuid;
  v_who         uuid := auth.uid();
  v_who_name    text;
  v_label       text;
  v_field       text;
  v_old_value   text;
  v_new_value   text;
  v_fields      text[];
  v_labels      text[];
  v_i           int;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_record := (v_row ->> 'id')::uuid;

  select full_name into v_who_name from public.staff where user_id = v_who;
  -- A family writing from their own app is not staff: say so rather than
  -- leaving the line looking like nobody did it.
  if v_who is not null and v_who_name is null then
    v_who_name := 'The family';
  end if;

  -- Which columns are worth a line, and what to call them in plain words.
  if tg_table_name = 'school_shortlist' then
    v_family := (v_row ->> 'family_id')::uuid;
    v_fields := array['tour_date','tour_start_time','tour_end_time','tour_status','tour_cancelled_reason',
                      'tour2_date','tour2_start_time','tour2_end_time','tour2_status','tour2_cancelled_reason',
                      'availability_status','enquiry_sent_at','enquiry_skipped_at','family_decision',
                      'family_decision_note','family_interest','feedback_text','priority','tour_shared_at','tour2_shared_at'];
    v_labels := array['primary tour date','primary tour start','primary tour end','primary tour status','why the primary tour was cancelled',
                      'secondary tour date','secondary tour start','secondary tour end','secondary tour status','why the secondary tour was cancelled',
                      'availability','availability email sent','availability email skipped','the family''s decision',
                      'the family''s reason','the family''s view','parent feedback','primary or backup choice','tour schedule sent to the parent','secondary tour schedule sent to the parent'];
    v_label := 'a shortlisted school';
  elsif tg_table_name = 'application_fees' then
    select c.family_id into v_family
      from public.applications a
      join public.children c on c.id = a.child_id
     where a.id = (v_row ->> 'application_id')::uuid;
    v_fields := array['status','amount','currency','due_date','paid_at','sent_to_family_at','paid_direct_by_family','hhe_paid_school_on_behalf','label'];
    v_labels := array['application fee status','application fee amount','application fee currency','application fee due date','application fee paid on','application fee sent to the family','application fee paid straight to the school','application fee paid by HHE for the family','application fee name'];
    v_label := 'an application fee';
  elsif tg_table_name = 'documents' then
    if (v_row ->> 'owner_type') = 'parent' then
      select p.family_id into v_family from public.parents p where p.id = (v_row ->> 'owner_id')::uuid;
    elsif (v_row ->> 'owner_type') = 'child' then
      select c.family_id into v_family from public.children c where c.id = (v_row ->> 'owner_id')::uuid;
    else
      select c.family_id into v_family
        from public.applications a
        join public.children c on c.id = a.child_id
       where a.id = (v_row ->> 'owner_id')::uuid;
    end if;
    v_fields := array['status','file_url','document_type','expires_at'];
    v_labels := array['document status','document file','document type','document expiry'];
    v_label := coalesce(replace(v_row ->> 'document_type', '_', ' '), 'a document');
  elsif tg_table_name = 'tasks' then
    v_family := (v_row ->> 'family_id')::uuid;
    v_fields := array['title','due_date','note'];
    v_labels := array['task','task due date','task note'];
    v_label := coalesce(v_row ->> 'title', 'a task');
  else
    return coalesce(new, old);
  end if;

  -- A row arriving or going is one line; a change is one line per column.
  if tg_op in ('INSERT', 'DELETE') then
    -- Tasks already record who added them, and a fee row says nothing on its
    -- own, so only the two worth a line are kept here.
    if tg_table_name in ('school_shortlist', 'documents') then
      insert into public.record_audit_log (family_id, table_name, record_id, field_name, field_label, old_value, new_value, changed_by, changed_by_name)
      values (v_family, tg_table_name, v_record, case when tg_op = 'INSERT' then 'added' else 'removed' end,
              case when tg_table_name = 'school_shortlist' then 'a school on the shortlist' else v_label end,
              case when tg_op = 'DELETE' then v_label else null end,
              case when tg_op = 'INSERT' then v_label else null end,
              v_who, v_who_name);
    end if;
    return coalesce(new, old);
  end if;

  v_i := 1;
  while v_i <= array_length(v_fields, 1) loop
    v_field := v_fields[v_i];
    if v_row ? v_field then
      v_old_value := v_old ->> v_field;
      v_new_value := v_row ->> v_field;
      if v_old_value is distinct from v_new_value then
        insert into public.record_audit_log (family_id, table_name, record_id, field_name, field_label, old_value, new_value, changed_by, changed_by_name)
        values (v_family, tg_table_name, v_record, v_field, v_labels[v_i], v_old_value, v_new_value, v_who, v_who_name);
      end if;
    end if;
    v_i := v_i + 1;
  end loop;

  return new;
end;
$$;

comment on function public.audit_watched_changes is
  'Writes one record_audit_log row per watched column that changed, for the tables that kept no history of their own. See addendum 150.';

drop trigger if exists audit_school_shortlist_trg on public.school_shortlist;
create trigger audit_school_shortlist_trg
  after insert or update or delete on public.school_shortlist
  for each row execute function public.audit_watched_changes();

drop trigger if exists audit_application_fees_trg on public.application_fees;
create trigger audit_application_fees_trg
  after insert or update or delete on public.application_fees
  for each row execute function public.audit_watched_changes();

drop trigger if exists audit_documents_trg on public.documents;
create trigger audit_documents_trg
  after insert or update or delete on public.documents
  for each row execute function public.audit_watched_changes();

drop trigger if exists audit_tasks_trg on public.tasks;
create trigger audit_tasks_trg
  after update on public.tasks
  for each row execute function public.audit_watched_changes();

notify pgrst, 'reload schema';
