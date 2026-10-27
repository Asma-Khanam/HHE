-- Addendum 136: family notifications (in-app inbox).
-- A notification row is created automatically when a consultant schedules or
-- changes a school tour, or an assessment. The client app shows them under the
-- bell; push notifications (later) will read from this same table.
-- Safe to re-run.

create table if not exists public.family_notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  kind text not null check (kind in (
    'tour_scheduled', 'tour_updated', 'tour_cancelled',
    'assessment_scheduled', 'assessment_updated'
  )),
  title text not null,
  body text,
  details jsonb not null default '[]'::jsonb,   -- [{"label":"Gate","value":"Gate 2"}, ...]
  link text,                                    -- e.g. the video-assessment link
  source_id uuid,                               -- shortlist row / application row
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_family_notifications_family
  on public.family_notifications(family_id, created_at desc);

alter table public.family_notifications enable row level security;

drop policy if exists "family reads own notifications" on public.family_notifications;
create policy "family reads own notifications" on public.family_notifications
  for select using (
    family_id in (select id from public.families where account_user_id = auth.uid())
  );

drop policy if exists "staff read notifications" on public.family_notifications;
create policy "staff read notifications" on public.family_notifications
  for select using (public.is_staff());

-- Family marks its own notifications read.
create or replace function public.family_mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.family_notifications n
     set read_at = now()
   where n.read_at is null
     and n.family_id in (select id from public.families where account_user_id = auth.uid());
$$;
revoke all on function public.family_mark_notifications_read() from public;
grant execute on function public.family_mark_notifications_read() to authenticated;

-- Helper: append {"label","value"} to a jsonb array only when value is not blank.
create or replace function public._notif_detail(p_arr jsonb, p_label text, p_value text)
returns jsonb
language sql
immutable
as $$
  select case when nullif(btrim(coalesce(p_value, '')), '') is null
              then p_arr
              else p_arr || jsonb_build_array(jsonb_build_object('label', p_label, 'value', btrim(p_value)))
         end;
$$;

-- ---------------------------------------------------------------- TOURS ----
create or replace function public.notify_family_tour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school text;
  v_when text;
  v_details jsonb := '[]'::jsonb;
  v_kind text;
  v_title text;
  v_changed boolean;
begin
  if new.tour_status is null or new.tour_status not in ('offered', 'confirmed', 'cancelled') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_changed :=
         new.tour_status        is distinct from old.tour_status
      or new.tour_date          is distinct from old.tour_date
      or new.tour_start_time    is distinct from old.tour_start_time
      or new.tour_end_time      is distinct from old.tour_end_time
      or new.tour_gate          is distinct from old.tour_gate
      or new.tour_building      is distinct from old.tour_building
      or new.tour_parking       is distinct from old.tour_parking
      or new.tour_maps_url      is distinct from old.tour_maps_url
      or new.tour_ask_for       is distinct from old.tour_ask_for
      or new.tour_bring         is distinct from old.tour_bring
      or new.tour_on_arrival    is distinct from old.tour_on_arrival
      or new.tour_arrival_note  is distinct from old.tour_arrival_note;
    if not v_changed then
      return new;
    end if;
  end if;

  -- A tour with no date yet is not worth telling the family about.
  if new.tour_status <> 'cancelled' and new.tour_date is null then
    return new;
  end if;

  select s.name into v_school from public.schools s where s.id = new.school_id;
  v_school := coalesce(v_school, 'the school');

  if new.tour_status = 'cancelled' then
    v_kind := 'tour_cancelled';
    v_title := 'Tour cancelled: ' || v_school;
    insert into public.family_notifications (family_id, school_id, kind, title, body, details, source_id)
    values (new.family_id, new.school_id, v_kind, v_title,
            'Your tour at ' || v_school || ' has been cancelled. Your consultant will be in touch about a new time.',
            '[]'::jsonb, new.id);
    return new;
  end if;

  v_when := to_char(new.tour_date, 'FMDay DD FMMonth YYYY');
  if new.tour_start_time is not null then
    v_when := v_when || ' at ' || to_char(new.tour_start_time, 'FMHH12:MI AM');
    if new.tour_end_time is not null then
      v_when := v_when || ' to ' || to_char(new.tour_end_time, 'FMHH12:MI AM');
    end if;
  end if;

  v_details := public._notif_detail(v_details, 'When', v_when);
  v_details := public._notif_detail(v_details, 'Building', new.tour_building);
  v_details := public._notif_detail(v_details, 'Gate', new.tour_gate);
  v_details := public._notif_detail(v_details, 'Parking', new.tour_parking);
  v_details := public._notif_detail(v_details, 'Ask for', new.tour_ask_for);
  v_details := public._notif_detail(v_details, 'On arrival', new.tour_on_arrival);
  v_details := public._notif_detail(v_details, 'Bring', new.tour_bring);
  v_details := public._notif_detail(v_details, 'Note', new.tour_arrival_note);

  if tg_op = 'INSERT' or old.tour_date is null or old.tour_status is null or old.tour_status = 'cancelled' then
    v_kind := 'tour_scheduled';
    v_title := 'Tour booked: ' || v_school;
  else
    v_kind := 'tour_updated';
    v_title := 'Tour updated: ' || v_school;
  end if;

  insert into public.family_notifications (family_id, school_id, kind, title, body, details, link, source_id)
  values (new.family_id, new.school_id, v_kind, v_title,
          'Your school tour at ' || v_school || ' is on ' || v_when || '.',
          v_details, nullif(btrim(coalesce(new.tour_maps_url, '')), ''), new.id);

  return new;
end;
$$;

drop trigger if exists school_shortlist_notify_family_tour_trg on public.school_shortlist;
create trigger school_shortlist_notify_family_tour_trg
  after insert or update on public.school_shortlist
  for each row execute function public.notify_family_tour();

-- ----------------------------------------------------------- ASSESSMENTS ----
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
  v_when text;
  v_mode text;
  v_details jsonb := '[]'::jsonb;
  v_kind text;
  v_title text;
begin
  if new.assessment_date is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and not (
       new.assessment_date      is distinct from old.assessment_date
    or new.assessment_time      is distinct from old.assessment_time
    or new.assessment_in_person is distinct from old.assessment_in_person
    or new.assessment_link      is distinct from old.assessment_link
    or new.assessment_meeting_id is distinct from old.assessment_meeting_id
    or new.assessment_passcode  is distinct from old.assessment_passcode
    or new.assessment_notes     is distinct from old.assessment_notes
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
  v_school := coalesce(v_school, 'the school');

  v_when := to_char(new.assessment_date, 'FMDay DD FMMonth YYYY');
  if new.assessment_time is not null then
    v_when := v_when || ' at ' || to_char(new.assessment_time, 'FMHH12:MI AM');
  end if;
  v_mode := case when new.assessment_in_person then 'In person at the school' else 'Online' end;

  v_details := public._notif_detail(v_details, 'Child', v_child);
  v_details := public._notif_detail(v_details, 'When', v_when);
  v_details := public._notif_detail(v_details, 'Format', v_mode);
  if not new.assessment_in_person then
    v_details := public._notif_detail(v_details, 'Join link', new.assessment_link);
    v_details := public._notif_detail(v_details, 'Meeting ID', new.assessment_meeting_id);
    v_details := public._notif_detail(v_details, 'Passcode', new.assessment_passcode);
  end if;
  v_details := public._notif_detail(v_details, 'Notes', new.assessment_notes);

  if tg_op = 'INSERT' or old.assessment_date is null then
    v_kind := 'assessment_scheduled';
    v_title := 'Assessment booked: ' || v_school;
  else
    v_kind := 'assessment_updated';
    v_title := 'Assessment updated: ' || v_school;
  end if;

  insert into public.family_notifications (family_id, school_id, kind, title, body, details, link, source_id)
  values (v_family, new.school_id, v_kind, v_title,
          coalesce(v_child || '''s', 'The') || ' assessment at ' || v_school || ' is on ' || v_when
            || case when new.assessment_in_person then ' (in person).' else ' (online).' end,
          v_details,
          case when new.assessment_in_person then null else nullif(btrim(coalesce(new.assessment_link, '')), '') end,
          new.id);

  return new;
end;
$$;

drop trigger if exists applications_notify_family_assessment_trg on public.applications;
create trigger applications_notify_family_assessment_trg
  after insert or update on public.applications
  for each row execute function public.notify_family_assessment();

notify pgrst, 'reload schema';
