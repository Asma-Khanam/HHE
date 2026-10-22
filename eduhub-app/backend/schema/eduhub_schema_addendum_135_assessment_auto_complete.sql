-- ============================================================================
-- Addendum 135 -- Assessment done: stage moves on by itself once the date passes
--
-- Before: an application sat on "Assessment booked" until a person changed it.
-- Now: the day AFTER the assessment date (Dubai time), the application moves to
-- "Awaiting decision" and the timeline gets two lines ("Assessment completed"
-- and the stage change), marked as automatic. It runs every morning, and once
-- right now. Only applications still on "Assessment booked" move. Anything
-- already moved on, withdrawn or declined is left alone, and a person can
-- still change the stage by hand at any time.
--
-- Safe to re-run.
-- ============================================================================

create or replace function public.complete_past_assessments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer := 0;
  r record;
begin
  for r in
    select a.id, a.assessment_date
    from public.applications a
    where a.status = 'assessment_booked'
      and a.assessment_date is not null
      and a.assessment_date < (now() at time zone 'Asia/Dubai')::date
  loop
    update public.applications set status = 'under_review' where id = r.id;

    insert into public.application_events (application_id, event_type, description, occurred_at, source)
    values (r.id, 'assessment_completed',
            'Assessment completed (date passed: ' || to_char(r.assessment_date, 'DD Mon YYYY') || '). Marked automatically.',
            (r.assessment_date + 1)::timestamp at time zone 'Asia/Dubai', 'staff');

    insert into public.application_events (application_id, event_type, new_status, description, occurred_at, source)
    values (r.id, 'status_change', 'under_review',
            'Moved to Awaiting decision automatically after the assessment date.',
            now(), 'staff');

    moved := moved + 1;
  end loop;
  return moved;
end;
$$;

revoke all on function public.complete_past_assessments() from public, anon, authenticated;

-- Every morning at 02:00 Dubai time (22:00 UTC). Needs pg_cron (Database ->
-- Extensions -> pg_cron). If it is not on, this prints a notice instead of failing.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'complete-past-assessments';
    perform cron.schedule('complete-past-assessments', '0 22 * * *', 'select public.complete_past_assessments();');
    raise notice 'Scheduled: complete-past-assessments, daily.';
  else
    raise notice 'pg_cron is not enabled. Enable it under Database -> Extensions, then run this file again.';
  end if;
end $$;

-- Catch up right now: how many applications moved.
select public.complete_past_assessments() as applications_moved_now;

notify pgrst, 'reload schema';
