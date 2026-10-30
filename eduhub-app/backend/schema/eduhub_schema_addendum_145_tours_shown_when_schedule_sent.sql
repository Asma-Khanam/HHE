-- Addendum 145 (30 Oct 2026): the family's app only shows a tour once the
-- consultant has sent them the schedule.
--
-- Until now a tour the consultant had typed in (status "offered") showed up in
-- the family's app, notifications and reminders straight away. With the new
-- workflow a school's offered time is only a possibility, so the family must
-- not see it until the consultant has confirmed it with the school and pressed
-- "Send schedule to parent".
--
--  * tour_shared_at / tour2_shared_at on school_shortlist: when the family was
--    sent that tour. Every tour that already exists is marked as shared now
--    (so nothing disappears from a family's app and nobody is re-notified).
--  * share_tour_schedule(family): staff-only. Marks every confirmed, not yet
--    shared tour of the family as shared. That fires the usual "Tour booked"
--    notification for each one, with the gate, building and so on.
--  * The tour notification (addendum 137) and the tour reminders (addendum 140)
--    skip tours that have not been shared.
--
-- Needs addenda 136, 137, 138, 140. Safe to re-run.

alter table public.school_shortlist add column if not exists tour_shared_at timestamptz;
alter table public.school_shortlist add column if not exists tour2_shared_at timestamptz;

-- Mark the tours that already exist as shared, without firing notifications.
alter table public.school_shortlist disable trigger school_shortlist_notify_family_tour_trg;
update public.school_shortlist set tour_shared_at = now() where tour_date is not null and tour_shared_at is null;
update public.school_shortlist set tour2_shared_at = now() where tour2_date is not null and tour2_shared_at is null;
alter table public.school_shortlist enable trigger school_shortlist_notify_family_tour_trg;

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
  v_shared text;
  v_old_shared text;
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

    v_shared := v_new ->> (v_p || 'shared_at');
    v_old_shared := v_old ->> (v_p || 'shared_at');

    continue when v_status is null or v_status not in ('offered', 'confirmed', 'cancelled');
    -- The family only hears about a tour once the consultant has sent them the schedule.
    continue when v_shared is null;

    if tg_op = 'UPDATE' then
      v_changed :=
           v_status is distinct from v_old_status
        or v_new ->> (v_p || 'date') is distinct from v_old_date
        or v_new ->> (v_p || 'start_time') is distinct from v_old ->> (v_p || 'start_time')
        or v_new ->> (v_p || 'end_time') is distinct from v_old ->> (v_p || 'end_time')
        or v_shared is distinct from v_old_shared;
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

    if tg_op = 'INSERT' or v_old_shared is null or v_old_date is null or v_old_status is null or v_old_status = 'cancelled' then
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

create or replace function public.send_tour_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_slot smallint;
  v_date date;
  v_start time;
  v_end time;
  v_status text;
  v_sch public.schools%rowtype;
  v_details jsonb;
  v_body text;
  v_when text;
  v_now_dubai timestamptz := now();
  v_today_dubai date := (now() at time zone 'Asia/Dubai')::date;
  v_tomorrow date := v_today_dubai + 1;
  v_sent integer := 0;
  v_kind text;
  v_label text;
  v_placed boolean;
  v_tour_ts timestamptz;
begin
  for r in
    select *
      from public.school_shortlist s
     where (s.tour_shared_at is not null and s.tour_date is not null and s.tour_date >= v_today_dubai and coalesce(s.tour_status,'offered') in ('offered','confirmed'))
        or (s.tour2_shared_at is not null and s.tour2_date is not null and s.tour2_date >= v_today_dubai and coalesce(s.tour2_status,'offered') in ('offered','confirmed'))
  loop
    -- Loop once for each of the two tour slots on the row.
    for v_slot in 1..2 loop
      if v_slot = 1 then
        v_date := r.tour_date;   v_start := r.tour_start_time;   v_end := r.tour_end_time;   v_status := r.tour_status;
      else
        v_date := r.tour2_date;  v_start := r.tour2_start_time;  v_end := r.tour2_end_time;  v_status := r.tour2_status;
      end if;
      if v_date is null or v_date < v_today_dubai or coalesce(v_status,'offered') not in ('offered','confirmed')
         or (v_slot = 1 and r.tour_shared_at is null) or (v_slot = 2 and r.tour2_shared_at is null) then
        continue;
      end if;

      -- Skip tours at schools the family has already placed every child elsewhere from.
      select exists (
        select 1
          from public.applications a
          join public.children c on c.id = a.child_id
         where c.family_id = r.family_id
           and a.status = 'offer_accepted'
           and a.school_id <> r.school_id
      ) into v_placed;
      if v_placed and v_date > v_today_dubai then
        -- A tour today still gets its reminders (the family may still attend); a future one does not.
        continue;
      end if;

      -- School + its default tour details (same precedence as addendum 137).
      select * into v_sch from public.schools where id = r.school_id;

      v_when := to_char(v_date, 'FMDay DD FMMonth YYYY');
      if v_start is not null then
        v_when := v_when || ' at ' || to_char(v_start, 'FMHH12:MI AM');
        if v_end is not null then
          v_when := v_when || ' to ' || to_char(v_end, 'FMHH12:MI AM');
        end if;
      end if;

      v_details := '[]'::jsonb;
      v_details := public._notif_detail(v_details, 'When', v_when);
      v_details := public._notif_detail(v_details, 'Building', coalesce(nullif(btrim(r.tour_building),''), v_sch.default_tour_building));
      v_details := public._notif_detail(v_details, 'Gate',     coalesce(nullif(btrim(r.tour_gate),''),     v_sch.default_tour_gate));
      v_details := public._notif_detail(v_details, 'Parking',  coalesce(nullif(btrim(r.tour_parking),''),  v_sch.default_tour_parking));
      v_details := public._notif_detail(v_details, 'Ask for',  coalesce(nullif(btrim(r.tour_ask_for),''),  v_sch.default_tour_ask_for));
      v_details := public._notif_detail(v_details, 'On arrival', coalesce(nullif(btrim(r.tour_on_arrival),''), v_sch.default_tour_on_arrival));
      v_details := public._notif_detail(v_details, 'Bring',    coalesce(nullif(btrim(r.tour_bring),''),    v_sch.default_tour_bring));

      -- Day-before reminder: fire once v_date = tomorrow (Dubai time) and no reminder has been sent for this (row, slot, date).
      if v_date = v_tomorrow then
        if not exists (
          select 1 from public.family_notifications n
           where n.source_id = r.id and n.slot = v_slot
             and n.kind = 'tour_reminder_day' and n.event_date = v_date
        ) then
          v_body := 'Reminder: your tour at ' || coalesce(v_sch.name,'the school') || ' is tomorrow';
          if v_start is not null then v_body := v_body || ' at ' || to_char(v_start, 'FMHH12:MI AM'); end if;
          v_body := v_body || '.';
          insert into public.family_notifications
            (family_id, school_id, school_name, kind, title, body, details, link, source_id, slot, event_date, event_time)
          values
            (r.family_id, r.school_id, v_sch.name, 'tour_reminder_day',
             'Tomorrow: tour at ' || coalesce(v_sch.name,'the school'),
             v_body, v_details, nullif(btrim(coalesce(r.tour_maps_url, v_sch.default_tour_maps_url, '')), ''),
             r.id, v_slot, v_date,
             case when v_start is not null then to_char(v_start, 'FMHH12:MI AM') else null end);
          v_sent := v_sent + 1;
        end if;
      end if;

      -- Two-hour reminder: tour starts between now and now + 2h30m (we run every 15 min so the window covers one tick).
      if v_start is not null then
        v_tour_ts := ((v_date::text || ' ' || v_start::text)::timestamp at time zone 'Asia/Dubai');
        if v_tour_ts > v_now_dubai and v_tour_ts <= v_now_dubai + interval '2 hours 30 minutes' then
          if not exists (
            select 1 from public.family_notifications n
             where n.source_id = r.id and n.slot = v_slot
               and n.kind = 'tour_reminder_hours' and n.event_date = v_date
          ) then
            v_body := 'Your tour at ' || coalesce(v_sch.name,'the school') || ' starts in about two hours (' || to_char(v_start, 'FMHH12:MI AM') || ').';
            insert into public.family_notifications
              (family_id, school_id, school_name, kind, title, body, details, link, source_id, slot, event_date, event_time)
            values
              (r.family_id, r.school_id, v_sch.name, 'tour_reminder_hours',
               'In 2 hours: tour at ' || coalesce(v_sch.name,'the school'),
               v_body, v_details, nullif(btrim(coalesce(r.tour_maps_url, v_sch.default_tour_maps_url, '')), ''),
               r.id, v_slot, v_date, to_char(v_start, 'FMHH12:MI AM'));
            v_sent := v_sent + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.send_tour_reminders() from public, anon, authenticated;

-- Staff: send the schedule to the family's app.
create or replace function public.share_tour_schedule(p_family uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n integer;
begin
  if not public.is_staff() then
    raise exception 'Staff only';
  end if;

  update public.school_shortlist
     set tour_shared_at = now()
   where family_id = p_family
     and tour_date is not null
     and tour_status = 'confirmed'
     and tour_shared_at is null;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  update public.school_shortlist
     set tour2_shared_at = now()
   where family_id = p_family
     and tour2_date is not null
     and tour2_status = 'confirmed'
     and tour2_shared_at is null;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  return v_count;
end;
$$;
revoke all on function public.share_tour_schedule(uuid) from public, anon;
grant execute on function public.share_tour_schedule(uuid) to authenticated;
