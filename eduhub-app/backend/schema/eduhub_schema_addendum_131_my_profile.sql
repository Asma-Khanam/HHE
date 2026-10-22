-- Addendum 131 (22 Oct 2026): "My profile" for every teammate.
--
-- Until now only an admin could change a teammate's details. This lets each
-- person edit THEIR OWN name, phone, location and short bio from a My profile
-- page. Position and role stay admin-only. Run after addendum 130. Safe to re-run.

alter table public.staff add column if not exists phone text;
alter table public.staff add column if not exists location text;
alter table public.staff add column if not exists bio text;

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_location text,
  p_bio text
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
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         phone     = nullif(btrim(p_phone), ''),
         location  = nullif(btrim(p_location), ''),
         bio       = nullif(btrim(p_bio), '')
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.update_my_profile(text, text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
