-- ============================================================================
-- Addendum 26 — 2026-09-09: CH-06's admin-editable year-group cut-off
--
-- What this is for
-- ----------------
-- CH-06 asks that the year-group suggestion's cut-off date (31 August by
-- default, UK/UAE British curriculum) be editable from the founders app,
-- not fixed in code — "it differs by curriculum and we will need to adjust
-- it." This is a single settings row both apps read: the family-facing form
-- needs it live to calculate a suggestion as a parent types in a date of
-- birth, and only a staff admin can change it, from the new Settings page.
--
-- A single-row table (id is always 'default') rather than a generic
-- key/value store, on purpose — there's exactly one setting today, and a
-- real column with a check constraint catches a bad value (a month outside
-- 1–12, say) at the database, not by accident in the app.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Depends on is_staff_admin() from addendum 13 — run that
--   first if this is a fresh project.
-- ============================================================================

create table if not exists public.app_settings (
  id text primary key default 'default',
  -- 1 = January ... 12 = December — the way a person picks a month on the
  -- Settings page, NOT JavaScript's 0-indexed Date months. Both apps convert
  -- when they build a Date object from this.
  year_group_cutoff_month integer not null default 8 check (year_group_cutoff_month between 1 and 12),
  year_group_cutoff_day integer not null default 31 check (year_group_cutoff_day between 1 and 31),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

comment on table public.app_settings is
  'Org-wide settings editable from the founders app''s Settings page. Single row, id=''default''. Started with the CH-06 year-group cut-off; more settings can be added as columns here later.';

-- The one and only row this table ever needs. Safe to re-run — does nothing
-- if it's already there.
insert into public.app_settings (id) values ('default') on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Anyone signed in — family or staff — can read it: the family-facing form
-- needs this to calculate a live year-group suggestion as a parent fills in
-- a child's date of birth, long before anyone from the team is involved.
drop policy if exists "app_settings_read_authenticated" on public.app_settings;
create policy "app_settings_read_authenticated" on public.app_settings
  for select
  using (auth.role() = 'authenticated');

-- Only a staff admin can change it — this is exactly the number Heather
-- asked to be able to adjust herself, without needing SQL run for her each
-- time a new curriculum's cut-off comes up.
drop policy if exists "app_settings_admin_update" on public.app_settings;
create policy "app_settings_admin_update" on public.app_settings
  for update
  using (public.is_staff_admin())
  with check (public.is_staff_admin());

notify pgrst, 'reload schema';
