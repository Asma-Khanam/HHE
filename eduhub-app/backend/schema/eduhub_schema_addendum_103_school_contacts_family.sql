-- Addendum 103 (12 Oct 2026): Miss Lyndsay -- school contacts the consultant
-- adds (e.g. the admissions email at a child's school) show on the parent
-- dashboard. Staff choose per contact with "Parents see" (on by default);
-- families can read only shared, not-archived contacts at schools on their
-- own shortlist or applications. Case notes are untouched (staff-only).
-- Safe to re-run. Needs addendum 80.

alter table public.school_contacts
  add column if not exists share_with_family boolean not null default true;

drop policy if exists "family read shared school contacts" on public.school_contacts;
create policy "family read shared school contacts" on public.school_contacts
  for select
  using (
    share_with_family
    and archived_at is null
    and (
      school_id in (
        select s.school_id from public.school_shortlist s
        where s.family_id in (select id from public.families where account_user_id = auth.uid())
      )
      or school_id in (
        select a.school_id from public.applications a
        join public.children c on c.id = a.child_id
        join public.families f on f.id = c.family_id
        where f.account_user_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';
