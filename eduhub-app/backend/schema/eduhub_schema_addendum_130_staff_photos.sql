-- Addendum 130 (22 Oct 2026): profile photos for the team.
--
-- Each teammate can have a photo, shown as a circle on the Team page and in the
-- sidebar. Photos sit in their own public bucket (a team headshot is not private,
-- and public links load instantly with no signing). Everyone on the team can add
-- their own; an admin can add or change anyone's. Run after addendum 13.
-- Safe to re-run.

alter table public.staff add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('staff-avatars', 'staff-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "staff_avatars_read" on storage.objects;
create policy "staff_avatars_read" on storage.objects
  for select using (bucket_id = 'staff-avatars');

drop policy if exists "staff_avatars_insert" on storage.objects;
create policy "staff_avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and public.is_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_admin())
  );

drop policy if exists "staff_avatars_update" on storage.objects;
create policy "staff_avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_admin())
  );

drop policy if exists "staff_avatars_delete" on storage.objects;
create policy "staff_avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-avatars'
    and public.is_staff()
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_admin())
  );

-- Save the photo's link on a staff row: your own, or anyone's if you are an admin.
create or replace function public.set_staff_avatar(p_user_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only.';
  end if;
  if p_user_id <> auth.uid() and not public.is_staff_admin() then
    raise exception 'Only an admin can change someone else''s photo.';
  end if;
  update public.staff set avatar_url = nullif(p_url, '') where user_id = p_user_id;
end;
$$;

revoke execute on function public.set_staff_avatar(uuid, text) from public, anon;
grant execute on function public.set_staff_avatar(uuid, text) to authenticated;

notify pgrst, 'reload schema';
