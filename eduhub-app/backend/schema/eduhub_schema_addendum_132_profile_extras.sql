-- Addendum 132 (22 Oct 2026): more on "My profile".
-- Adds languages, expertise areas, time zone and LinkedIn to each teammate's
-- own profile. Replaces the update_my_profile function from addendum 131.
-- Run after addendum 131. Safe to re-run.

alter table public.staff add column if not exists languages text[] not null default '{}';
alter table public.staff add column if not exists specialties text[] not null default '{}';
alter table public.staff add column if not exists timezone text;
alter table public.staff add column if not exists linkedin text;

drop function if exists public.update_my_profile(text, text, text, text);

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_location text,
  p_bio text,
  p_languages text[],
  p_specialties text[],
  p_timezone text,
  p_linkedin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only.';
  end if;
  update public.staff
     set full_name  = coalesce(nullif(btrim(p_full_name), ''), full_name),
         phone      = nullif(btrim(p_phone), ''),
         location   = nullif(btrim(p_location), ''),
         bio        = nullif(left(btrim(p_bio), 400), ''),
         languages  = coalesce(p_languages[1:12], '{}'),
         specialties = coalesce(p_specialties[1:12], '{}'),
         timezone   = nullif(btrim(p_timezone), ''),
         linkedin   = nullif(left(btrim(p_linkedin), 200), '')
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.update_my_profile(text, text, text, text, text[], text[], text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text, text[], text[], text, text) to authenticated;

notify pgrst, 'reload schema';
