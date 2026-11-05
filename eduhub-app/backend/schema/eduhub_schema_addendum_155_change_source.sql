-- 155: say where every recorded change came from.
-- The Activity page showed "Not recorded" for any change made without a staff
-- login (an import, a payment, the email webhook, a scheduled job). This adds a
-- change_source to every audit row, set automatically from who/what is connected
-- when the change is saved. Nothing existing is changed and no app code has to
-- be touched. Safe to re-run.
--
--   staff     a signed-in staff member
--   family    a signed-in family (the Client app)
--   server    our server using the service key: OpenApply sync, payments, email webhook
--   schedule  a scheduled job, or someone editing the database directly
--
-- Code can be more specific for one save with:  select set_config('app.change_source', 'openapply', true);

alter table public.record_audit_log
  add column if not exists change_source text;

create or replace function public.audit_set_change_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := coalesce(auth.role(), current_setting('request.jwt.claim.role', true));
  v_over text := nullif(current_setting('app.change_source', true), '');
begin
  if new.change_source is not null then
    return new;
  end if;
  if v_over is not null then
    new.change_source := v_over;
  elsif v_uid is not null then
    new.change_source := case when exists (select 1 from public.staff where user_id = v_uid) then 'staff' else 'family' end;
  elsif v_role = 'service_role' then
    new.change_source := 'server';
  else
    new.change_source := 'schedule';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_set_change_source_trg on public.record_audit_log;
create trigger audit_set_change_source_trg
  before insert on public.record_audit_log
  for each row execute function public.audit_set_change_source();

notify pgrst, 'reload schema';
