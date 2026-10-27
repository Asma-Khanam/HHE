-- Addendum 138: automatic school updates.
-- The family is notified as soon as something changes, with no "Update family"
-- click: school added to the shortlist, tour completed, application sent,
-- offer received, offer accepted, waitlisted, not successful, no place
-- available. The "Update family" button still works and now also notifies
-- (use it for a custom message). Tours and assessments keep their own
-- detailed notifications (addenda 136/137).
-- Safe to re-run.

alter table public.family_notifications add column if not exists stage text;
alter table public.family_notifications drop constraint if exists family_notifications_kind_check;
alter table public.family_notifications add constraint family_notifications_kind_check check (kind in (
  'tour_scheduled', 'tour_updated', 'tour_cancelled',
  'assessment_scheduled', 'assessment_updated',
  'school_update'
));

create or replace function public._notif_stage(
  p_family uuid, p_school uuid, p_child uuid, p_stage text, p_note text, p_source uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text;
  v_child text;
  v_label text;
  v_body text;
  v_details jsonb := '[]'::jsonb;
begin
  if p_family is null or p_school is null then
    return;
  end if;

  -- Same event twice in a few minutes (status flipped back and forth): once is enough.
  if exists (
    select 1 from public.family_notifications n
     where n.family_id = p_family and n.school_id = p_school and n.kind = 'school_update'
       and n.stage = p_stage and n.source_id is not distinct from p_source
       and n.created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  select s.name into v_school from public.schools s where s.id = p_school;
  v_school := coalesce(v_school, 'the school');
  if p_child is not null then
    select coalesce(nullif(btrim(c.preferred_name), ''), c.first_name) into v_child
      from public.children c where c.id = p_child;
  end if;

  v_label := case p_stage
    when 'shortlisted' then 'Shortlisted'
    when 'toured'      then 'Tour completed'
    when 'applied'     then 'Application sent'
    when 'assessment'  then 'Assessment'
    when 'offer'       then 'Offer received'
    when 'waitlisted'  then 'Waitlisted'
    when 'declined'    then 'Not successful'
    when 'no_place'    then 'No place available'
    when 'placed'      then 'Place confirmed'
    else 'Update' end;

  v_body := coalesce(nullif(btrim(coalesce(p_note, '')), ''), case p_stage
    when 'shortlisted' then v_school || ' has been added to your shortlist.'
    when 'toured'      then 'Your tour at ' || v_school || ' is complete.'
    when 'applied'     then 'Your application to ' || v_school || ' has been submitted.'
    when 'assessment'  then 'There is an update on the assessment at ' || v_school || '.'
    when 'offer'       then 'Good news: ' || v_school || ' has made an offer.'
    when 'waitlisted'  then 'You have been placed on the waiting list at ' || v_school || '.'
    when 'declined'    then v_school || ' was unable to offer a place.'
    when 'no_place'    then v_school || ' has no place available right now.'
    when 'placed'      then 'Your place at ' || v_school || ' is confirmed.'
    else 'There is an update on ' || v_school || '.' end);

  v_details := public._notif_detail(v_details, 'Child', v_child);
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    v_details := public._notif_detail(v_details, 'Message', p_note);
  end if;

  insert into public.family_notifications
    (family_id, school_id, school_name, kind, stage, title, body, details, source_id)
  values
    (p_family, p_school, v_school, 'school_update', p_stage, v_label || ': ' || v_school, v_body, v_details, p_source);
end;
$$;
revoke all on function public._notif_stage(uuid, uuid, uuid, text, text, uuid) from public;

-- 1. The "Update family" button (custom messages) now notifies too.
create or replace function public.notify_family_school_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notif_stage(new.family_id, new.school_id, new.child_id, new.stage, new.note, new.id);
  return new;
end;
$$;
drop trigger if exists family_school_updates_notify_trg on public.family_school_updates;
create trigger family_school_updates_notify_trg
  after insert on public.family_school_updates
  for each row execute function public.notify_family_school_update();

-- 2. Application status changes.
create or replace function public.notify_family_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage text;
  v_family uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_stage := case new.status
    when 'submitted'      then 'applied'
    when 'offer'          then 'offer'
    when 'offer_accepted' then 'placed'
    when 'waitlisted'     then 'waitlisted'
    when 'rejected'       then 'declined'
    else null end;
  if v_stage is null then
    return new;
  end if;

  select c.family_id into v_family from public.children c where c.id = new.child_id;
  perform public._notif_stage(v_family, new.school_id, new.child_id, v_stage, null, new.id);
  return new;
end;
$$;
drop trigger if exists applications_notify_family_stage_trg on public.applications;
create trigger applications_notify_family_stage_trg
  after update on public.applications
  for each row execute function public.notify_family_application_stage();

-- 3. Shortlist: school added, tour completed, school has no place.
create or replace function public.notify_family_shortlist_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._notif_stage(new.family_id, new.school_id, null, 'shortlisted', null, new.id);
    return new;
  end if;

  if new.availability_status = 'no' and new.availability_status is distinct from old.availability_status then
    perform public._notif_stage(new.family_id, new.school_id, null, 'no_place', null, new.id);
  end if;

  if new.tour_status = 'completed' and new.tour_status is distinct from old.tour_status then
    perform public._notif_stage(new.family_id, new.school_id, null, 'toured', null, new.id);
  end if;

  return new;
end;
$$;
drop trigger if exists school_shortlist_notify_family_stage_trg on public.school_shortlist;
create trigger school_shortlist_notify_family_stage_trg
  after insert or update on public.school_shortlist
  for each row execute function public.notify_family_shortlist_stage();

notify pgrst, 'reload schema';
