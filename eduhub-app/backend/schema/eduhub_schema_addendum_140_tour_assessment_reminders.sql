-- Addendum 140 (28 Oct 2026): Reminders before a tour or an assessment.
-- A family sees two reminders about each booked tour and each booked
-- assessment: one the day before, and one two hours before. The reminders
-- land in the same inbox and are the same shape as the other notifications,
-- with the day, time, address, join link and so on. If the tour or
-- assessment moves to a new day, that new day gets its own pair; a day that
-- already fired is never reminded about twice.
--
-- Runs every 15 minutes via pg_cron. Nothing is sent for a tour/assessment
-- without a date, or whose date is in the past, or whose status is cancelled,
-- or whose school a child in the family is already placed elsewhere from.
--
-- Needs addenda 136, 137, 138. Safe to re-run.

-- 1) Let the two new kinds through the inbox's CHECK constraint. ------------
alter table public.family_notifications drop constraint if exists family_notifications_kind_check;
alter table public.family_notifications add constraint family_notifications_kind_check
  check (kind in (
    'tour_scheduled', 'tour_updated', 'tour_cancelled',
    'assessment_scheduled', 'assessment_updated',
    'school_update',
    'tour_reminder_day', 'tour_reminder_hours',
    'assessment_reminder_day', 'assessment_reminder_hours'
  ));

-- 2) One reminder-sender for tours (handles both the primary and secondary
--    tour on a row). Mirrors the detail-building in addendum 137's
--    notify_family_tour so the reminder looks the same as the booking. --------
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
     where (s.tour_date is not null and s.tour_date >= v_today_dubai and coalesce(s.tour_status,'offered') in ('offered','confirmed'))
        or (s.tour2_date is not null and s.tour2_date >= v_today_dubai and coalesce(s.tour2_status,'offered') in ('offered','confirmed'))
  loop
    -- Loop once for each of the two tour slots on the row.
    for v_slot in 1..2 loop
      if v_slot = 1 then
        v_date := r.tour_date;   v_start := r.tour_start_time;   v_end := r.tour_end_time;   v_status := r.tour_status;
      else
        v_date := r.tour2_date;  v_start := r.tour2_start_time;  v_end := r.tour2_end_time;  v_status := r.tour2_status;
      end if;
      if v_date is null or v_date < v_today_dubai or coalesce(v_status,'offered') not in ('offered','confirmed') then
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
        v_tour_ts := ((v_date::text || ' ' || v_start::text) at time zone 'Asia/Dubai');
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

-- 3) Same for assessments. One row per application (no slots).
create or replace function public.send_assessment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_family uuid;
  v_sch public.schools%rowtype;
  v_child text;
  v_details jsonb;
  v_body text;
  v_when text;
  v_mode text;
  v_now_dubai timestamptz := now();
  v_today_dubai date := (now() at time zone 'Asia/Dubai')::date;
  v_tomorrow date := v_today_dubai + 1;
  v_assess_ts timestamptz;
  v_sent integer := 0;
begin
  for a in
    select app.*, ch.family_id as family_id, ch.first_name
      from public.applications app
      join public.children ch on ch.id = app.child_id
     where app.assessment_date is not null
       and app.assessment_date >= v_today_dubai
       and app.status in ('submitted','assessment_booked','under_review','waitlisted','draft')
  loop
    select * into v_sch from public.schools where id = a.school_id;
    v_child := nullif(btrim(coalesce(a.first_name, '')), '');
    v_mode := case when a.assessment_in_person then 'in person'
                   when a.assessment_video_requested then 'video'
                   else 'online' end;

    v_when := to_char(a.assessment_date, 'FMDay DD FMMonth YYYY');
    if a.assessment_time is not null then
      v_when := v_when || ' at ' || to_char(a.assessment_time, 'FMHH12:MI AM');
    end if;

    v_details := '[]'::jsonb;
    v_details := public._notif_detail(v_details, 'When', v_when);
    v_details := public._notif_detail(v_details, 'Mode', initcap(v_mode));
    v_details := public._notif_detail(v_details, 'Child', v_child);
    v_details := public._notif_detail(v_details, 'Meeting ID', a.assessment_meeting_id);
    v_details := public._notif_detail(v_details, 'Passcode', a.assessment_passcode);
    v_details := public._notif_detail(v_details, 'Notes', a.assessment_notes);

    -- Day-before.
    if a.assessment_date = v_tomorrow then
      if not exists (
        select 1 from public.family_notifications n
         where n.source_id = a.id and n.kind = 'assessment_reminder_day' and n.event_date = a.assessment_date
      ) then
        v_body := 'Reminder: ' || coalesce(v_child || '''s ', '') || 'assessment' ||
                  case when v_mode = 'in person' then ' at ' || coalesce(v_sch.name,'the school') else ' with ' || coalesce(v_sch.name,'the school') end ||
                  ' is tomorrow' ||
                  case when a.assessment_time is not null then ' at ' || to_char(a.assessment_time, 'FMHH12:MI AM') else '' end || '.';
        insert into public.family_notifications
          (family_id, school_id, school_name, kind, title, body, details, link, source_id, slot, event_date, event_time)
        values
          (a.family_id, a.school_id, v_sch.name, 'assessment_reminder_day',
           'Tomorrow: assessment' || case when v_child is not null then ' for ' || v_child else '' end,
           v_body, v_details, nullif(btrim(coalesce(a.assessment_link, '')), ''),
           a.id, 1, a.assessment_date,
           case when a.assessment_time is not null then to_char(a.assessment_time, 'FMHH12:MI AM') else null end);
        v_sent := v_sent + 1;
      end if;
    end if;

    -- Two-hour reminder (only when there is a specific time).
    if a.assessment_time is not null then
      v_assess_ts := ((a.assessment_date::text || ' ' || a.assessment_time::text) at time zone 'Asia/Dubai');
      if v_assess_ts > v_now_dubai and v_assess_ts <= v_now_dubai + interval '2 hours 30 minutes' then
        if not exists (
          select 1 from public.family_notifications n
           where n.source_id = a.id and n.kind = 'assessment_reminder_hours' and n.event_date = a.assessment_date
        ) then
          v_body := coalesce(v_child || '''s ', 'Your ') || 'assessment starts in about two hours (' || to_char(a.assessment_time, 'FMHH12:MI AM') || ').';
          insert into public.family_notifications
            (family_id, school_id, school_name, kind, title, body, details, link, source_id, slot, event_date, event_time)
          values
            (a.family_id, a.school_id, v_sch.name, 'assessment_reminder_hours',
             'In 2 hours: assessment' || case when v_child is not null then ' for ' || v_child else '' end,
             v_body, v_details, nullif(btrim(coalesce(a.assessment_link, '')), ''),
             a.id, 1, a.assessment_date, to_char(a.assessment_time, 'FMHH12:MI AM'));
          v_sent := v_sent + 1;
        end if;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.send_assessment_reminders() from public, anon, authenticated;

-- 4) One wrapper that pg_cron calls every 15 minutes.
create or replace function public.send_due_reminders()
returns table (tour_reminders int, assessment_reminders int)
language sql
security definer
set search_path = public
as $$
  select public.send_tour_reminders(), public.send_assessment_reminders();
$$;
revoke all on function public.send_due_reminders() from public, anon, authenticated;

-- 5) Schedule it. Needs pg_cron (Database → Extensions). Safe to re-run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'send-due-reminders';
    perform cron.schedule('send-due-reminders', '*/15 * * * *', 'select public.send_due_reminders();');
    raise notice 'Scheduled: send-due-reminders, every 15 minutes.';
  else
    raise notice 'pg_cron is not enabled. Enable it under Database -> Extensions, then run this file again.';
  end if;
end $$;

-- Run it once right now to catch any reminders already due.
select * from public.send_due_reminders();

notify pgrst, 'reload schema';
