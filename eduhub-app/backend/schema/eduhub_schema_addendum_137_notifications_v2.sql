-- Addendum 137: notifications v2.
--  * uses the school's own default tour details (gate, building, parking, who to
--    ask for, what to bring, maps link) when the tour itself has none, exactly
--    like the client app's tour card
--  * handles the second tour on a shortlist row
--  * edits made within 20 minutes of an unread notification update that
--    notification instead of adding a new one (autosave while typing)
--  * adds school_name / event_date / event_time for a cleaner inbox
-- Safe to re-run.

alter table public.family_notifications add column if not exists school_name text;
alter table public.family_notifications add column if not exists event_date date;
alter table public.family_notifications add column if not exists event_time text;
alter table public.family_notifications add column if not exists slot smallint not null default 1;

create or replace function public._notif_put(
  p_family uuid, p_school uuid, p_school_name text, p_source uuid, p_slot smallint,
  p_group text, p_kind text, p_label text, p_body text, p_details jsonb, p_link text,
  p_event_date date, p_event_time text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old_kind text;
  v_kind text := p_kind;
  v_title text;
begin
  select n.id, n.kind into v_id, v_old_kind
    from public.family_notifications n
   where n.source_id = p_source
     and n.slot = p_slot
     and n.kind like p_group || '\_%'
     and n.read_at is null
     and n.created_at > now() - interval '20 minutes'
   order by n.created_at desc
   limit 1;

  -- A "booked" notification that is then tweaked stays "booked".
  if v_id is not null and v_old_kind like '%\_scheduled' and p_kind like '%\_updated' then
    v_kind := v_old_kind;
  end if;

  v_title := p_label || case
    when v_kind like '%\_scheduled' then ' booked'
    when v_kind like '%\_updated' then ' updated'
    else ' cancelled' end || ': ' || coalesce(p_school_name, 'the school');

  if v_id is not null then
    update public.family_notifications
       set kind = v_kind, title = v_title, body = p_body, details = p_details, link = p_link,
           school_name = p_school_name, event_date = p_event_date, event_time = p_event_time,
           created_at = now()
     where id = v_id;
  else
    insert into public.family_notifications
      (family_id, school_id, school_name, kind, title, body, details, link, source_id, slot, event_date, event_time)
    values
      (p_family, p_school, p_school_name, v_kind, v_title, p_body, p_details, p_link, p_source, p_slot, p_event_date, p_event_time);
  end if;
end;
$$;
revoke all on function public._notif_put(uuid, uuid, text, uuid, smallint, text, text, text, text, jsonb, text, date, text) from public;

-- TOURS (first and second tour on a shortlist row)
create or replace function public.notify_family_tour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_sch public.schools%rowtype;
  v_slot smallint;
  v_p text;
  v_status text;
  v_date date;
  v_start time;
  v_end time;
  v_time text;
  v_when text;
  v_changed boolean;
  v_k text;
  v_gate text; v_building text; v_parking text; v_ask text; v_bring text;
  v_onarr text; v_maps text; v_arrival text;
  v_details jsonb;
  v_kind text;
  v_old_status text;
  v_old_date text;
begin
  select * into v_sch from public.schools where id = new.school_id;

  foreach v_slot in array array[1, 2]::smallint[] loop
    v_p := case when v_slot = 1 then 'tour_' else 'tour2_' end;
    v_status := v_new ->> (v_p || 'status');
    v_date := nullif(v_new ->> (v_p || 'date'), '')::date;
    v_start := nullif(v_new ->> (v_p || 'start_time'), '')::time;
    v_end := nullif(v_new ->> (v_p || 'end_time'), '')::time;
    v_old_status := v_old ->> (v_p || 'status');
    v_old_date := v_old ->> (v_p || 'date');

    continue when v_status is null or v_status not in ('offered', 'confirmed', 'cancelled');

    if tg_op = 'UPDATE' then
      v_changed :=
           v_status is distinct from v_old_status
        or v_new ->> (v_p || 'date') is distinct from v_old_date
        or v_new ->> (v_p || 'start_time') is distinct from v_old ->> (v_p || 'start_time')
        or v_new ->> (v_p || 'end_time') is distinct from v_old ->> (v_p || 'end_time');
      if v_status <> 'cancelled' then
        foreach v_k in array array['tour_gate','tour_building','tour_parking','tour_maps_url',
                                   'tour_ask_for','tour_bring','tour_on_arrival','tour_arrival_note'] loop
          if v_new ->> v_k is distinct from v_old ->> v_k then
            v_changed := true;
          end if;
        end loop;
      end if;
      continue when not v_changed;
      continue when v_status = 'cancelled' and v_status is not distinct from v_old_status;
    end if;

    if v_status <> 'cancelled' and v_date is null then
      continue;
    end if;

    if v_status = 'cancelled' then
      perform public._notif_put(
        new.family_id, new.school_id, v_sch.name, new.id, v_slot, 'tour', 'tour_cancelled', 'Tour',
        'Your tour at ' || coalesce(v_sch.name, 'the school') || ' has been cancelled. Your consultant will be in touch about a new time.',
        '[]'::jsonb, null, v_date, null);
      continue;
    end if;

    v_time := null;
    if v_start is not null then
      v_time := to_char(v_start, 'FMHH12:MIam');
      if v_end is not null then
        v_time := v_time || ' – ' || to_char(v_end, 'FMHH12:MIam');
      end if;
    end if;
    v_when := to_char(v_date, 'FMDay DD FMMonth YYYY') || coalesce(', ' || v_time, '');

    v_gate     := coalesce(nullif(btrim(new.tour_gate), ''),     nullif(btrim(v_sch.default_tour_gate), ''));
    v_building := coalesce(nullif(btrim(new.tour_building), ''), nullif(btrim(v_sch.default_tour_building), ''));
    v_parking  := coalesce(nullif(btrim(new.tour_parking), ''),  nullif(btrim(v_sch.default_tour_parking), ''));
    v_ask      := coalesce(nullif(btrim(new.tour_ask_for), ''),  nullif(btrim(v_sch.default_tour_ask_for), ''));
    v_onarr    := coalesce(nullif(btrim(new.tour_on_arrival), ''), nullif(btrim(v_sch.default_tour_on_arrival), ''));
    v_maps     := coalesce(nullif(btrim(new.tour_maps_url), ''), nullif(btrim(v_sch.default_tour_maps_url), ''));
    v_arrival  := coalesce(nullif(btrim(new.tour_arrival_note), ''), 'Please arrive 10 minutes early');
    v_bring    := coalesce(nullif(btrim(new.tour_bring), ''),    nullif(btrim(v_sch.default_tour_bring), ''), 'Passport/Emirates ID');

    v_details := '[]'::jsonb;
    v_details := public._notif_detail(v_details, 'Arrival', v_arrival);
    v_details := public._notif_detail(v_details, 'Gate', v_gate);
    v_details := public._notif_detail(v_details, 'Building', v_building);
    v_details := public._notif_detail(v_details, 'Parking', v_parking);
    v_details := public._notif_detail(v_details, 'Ask for', v_ask);
    v_details := public._notif_detail(v_details, 'On arrival', v_onarr);
    v_details := public._notif_detail(v_details, 'Bring', v_bring);
    v_details := public._notif_detail(v_details, 'Location', v_maps);

    if tg_op = 'INSERT' or v_old_date is null or v_old_status is null or v_old_status = 'cancelled' then
      v_kind := 'tour_scheduled';
    else
      v_kind := 'tour_updated';
    end if;

    perform public._notif_put(
      new.family_id, new.school_id, v_sch.name, new.id, v_slot, 'tour', v_kind, 'Tour',
      'Your school tour at ' || coalesce(v_sch.name, 'the school') || ' is on ' || v_when || '.',
      v_details, v_maps, v_date, v_time);
  end loop;

  return new;
end;
$$;

-- ASSESSMENTS
create or replace function public.notify_family_assessment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_child text;
  v_school text;
  v_time text;
  v_when text;
  v_mode text;
  v_details jsonb := '[]'::jsonb;
  v_kind text;
  v_link text;
begin
  if new.assessment_date is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and not (
       new.assessment_date       is distinct from old.assessment_date
    or new.assessment_time       is distinct from old.assessment_time
    or new.assessment_in_person  is distinct from old.assessment_in_person
    or new.assessment_link       is distinct from old.assessment_link
    or new.assessment_meeting_id is distinct from old.assessment_meeting_id
    or new.assessment_passcode   is distinct from old.assessment_passcode
    or new.assessment_notes      is distinct from old.assessment_notes
  ) then
    return new;
  end if;

  select c.family_id, coalesce(nullif(btrim(c.preferred_name), ''), c.first_name)
    into v_family, v_child
    from public.children c where c.id = new.child_id;
  if v_family is null then
    return new;
  end if;

  select s.name into v_school from public.schools s where s.id = new.school_id;

  v_time := case when new.assessment_time is not null then to_char(new.assessment_time, 'FMHH12:MIam') end;
  v_when := to_char(new.assessment_date, 'FMDay DD FMMonth YYYY') || coalesce(', ' || v_time, '');
  v_mode := case when new.assessment_in_person then 'In person at the school' else 'Online' end;
  v_link := case when new.assessment_in_person then null else nullif(btrim(coalesce(new.assessment_link, '')), '') end;

  v_details := public._notif_detail(v_details, 'Child', v_child);
  v_details := public._notif_detail(v_details, 'Format', v_mode);
  if not new.assessment_in_person then
    v_details := public._notif_detail(v_details, 'Join link', v_link);
    v_details := public._notif_detail(v_details, 'Meeting ID', new.assessment_meeting_id);
    v_details := public._notif_detail(v_details, 'Passcode', new.assessment_passcode);
  end if;
  v_details := public._notif_detail(v_details, 'Notes', new.assessment_notes);

  if tg_op = 'INSERT' or old.assessment_date is null then
    v_kind := 'assessment_scheduled';
  else
    v_kind := 'assessment_updated';
  end if;

  perform public._notif_put(
    v_family, new.school_id, v_school, new.id, 1::smallint, 'assessment', v_kind, 'Assessment',
    coalesce(v_child || '''s', 'The') || ' assessment at ' || coalesce(v_school, 'the school') || ' is on ' || v_when
      || case when new.assessment_in_person then ' (in person).' else ' (online).' end,
    v_details, v_link, new.assessment_date, v_time);

  return new;
end;
$$;

notify pgrst, 'reload schema';
