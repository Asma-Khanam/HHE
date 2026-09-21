-- Addendum 70: Heather's tracker round (21 Sept 2026)
--  1. Free-text description against each document
--  2. Pipeline stages: Documents uploaded / Schools suggested / Visits arranged /
--     Applications made / Offers received / Placed (keys unchanged, meaning re-mapped)
--  3. Where the family heard about us + partner referrals in / out
--  4. Placements: school start date per child, with a calendar reminder
-- Safe to re-run. Needs addenda 2, 12, 36, 48 already applied.

-- 1. Document descriptions ---------------------------------------------------
alter table public.documents add column if not exists description text;

drop policy if exists "staff_update_documents" on public.documents;
create policy "staff_update_documents" on public.documents
  for update using (public.is_staff()) with check (public.is_staff());

-- 2. Pipeline stages ---------------------------------------------------------
-- Keys stay the same so nothing else breaks; the labels change in the app:
--   enquiry  = Documents uploaded     profile = Schools suggested
--   applied  = Visits arranged        assessed = Applications made
--   offer    = Offers received        placed = Placed
create or replace function public.compute_pipeline_stage(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_offer boolean := false;
  v_has_application boolean := false;
  v_has_visit boolean := false;
  v_has_shortlist boolean := false;
begin
  select
    coalesce(bool_or(a.status in ('offer', 'offer_accepted')), false),
    coalesce(bool_or(a.status <> 'draft'), false)
  into v_has_offer, v_has_application
  from public.applications a
  join public.children c on c.id = a.child_id
  where c.family_id = p_family_id;

  select
    count(*) > 0,
    coalesce(bool_or(s.tour_status in ('offered', 'confirmed', 'completed')), false)
  into v_has_shortlist, v_has_visit
  from public.school_shortlist s
  where s.family_id = p_family_id;

  if v_has_offer then
    return 'offer';
  elsif v_has_application then
    return 'assessed';
  elsif v_has_visit then
    return 'applied';
  elsif v_has_shortlist then
    return 'profile';
  else
    return 'enquiry';
  end if;
end;
$$;

-- Also re-check a family whenever its shortlist changes.
create or replace function public.shortlist_advance_stage_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.advance_pipeline_stage(coalesce(new.family_id, old.family_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists shortlist_advance_stage_trg on public.school_shortlist;
create trigger shortlist_advance_stage_trg
  after insert or update on public.school_shortlist
  for each row execute function public.shortlist_advance_stage_trg_fn();

-- One-off: the old meaning of each stage differs, so re-place every family
-- that isn't Placed according to what its data now shows.
do $$
declare r record;
begin
  perform set_config('app.bypass_client_guard', 'true', true);
  for r in select id from public.families where pipeline_stage <> 'placed' loop
    update public.families set pipeline_stage = public.compute_pipeline_stage(r.id) where id = r.id;
  end loop;
end $$;

-- 3. Referrals ---------------------------------------------------------------
alter table public.families
  add column if not exists referral_source text,
  add column if not exists referral_source_detail text;

create table if not exists public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  partner_name text not null check (length(btrim(partner_name)) > 0),
  referred_on date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_partner_referrals_family on public.partner_referrals(family_id, referred_on);

alter table public.partner_referrals enable row level security;
drop policy if exists "staff read partner referrals" on public.partner_referrals;
create policy "staff read partner referrals" on public.partner_referrals for select using (public.is_staff());
drop policy if exists "staff add partner referrals" on public.partner_referrals;
create policy "staff add partner referrals" on public.partner_referrals for insert with check (public.is_staff());
drop policy if exists "staff edit partner referrals" on public.partner_referrals;
create policy "staff edit partner referrals" on public.partner_referrals for update using (public.is_staff()) with check (public.is_staff());

-- 4. Placements --------------------------------------------------------------
create table if not exists public.family_placements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  school_name text not null check (length(btrim(school_name)) > 0),
  start_date date not null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_family_placements_family on public.family_placements(family_id);

alter table public.family_placements enable row level security;
drop policy if exists "staff read placements" on public.family_placements;
create policy "staff read placements" on public.family_placements for select using (public.is_staff());
drop policy if exists "staff add placements" on public.family_placements;
create policy "staff add placements" on public.family_placements for insert with check (public.is_staff());
drop policy if exists "staff edit placements" on public.family_placements;
create policy "staff edit placements" on public.family_placements for update using (public.is_staff()) with check (public.is_staff());

notify pgrst, 'reload schema';
