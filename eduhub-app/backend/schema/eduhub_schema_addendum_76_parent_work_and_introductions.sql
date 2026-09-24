-- Addendum 76 (24 Sept 2026, founder request)
--  1. Two new parent questions: highest qualification, and whether the move
--     is a new position or an international transfer. (Company and job title
--     already existed as employer_name / occupation_designation.)
--  2. "Do you need help with...?" -- trusted partner introductions. Staff keep
--     one contact per service; a family ticks what they need on their
--     Dashboard and an introduction email goes to that contact.
-- Safe to re-run.

-- 1 ---------------------------------------------------------------------------
alter table public.parents
  add column if not exists highest_qualification text,
  add column if not exists move_type text;

-- 2 ---------------------------------------------------------------------------
create table if not exists public.partner_services (
  key text primary key,
  label text not null,
  contact_name text,
  contact_company text,
  contact_email text,
  active boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.partner_services (key, label, sort_order) values
  ('home', 'Finding a home', 1),
  ('visa', 'Visa / Golden Visa', 2),
  ('company_setup', 'Company set up', 3),
  ('pet', 'Moving a pet', 4),
  ('insurance', 'Health & property insurance', 5),
  ('uk_tax', 'UK expat tax advice', 6),
  ('car_hire', 'Car hire', 7)
on conflict (key) do nothing;

alter table public.partner_services enable row level security;
drop policy if exists "staff read partner services" on public.partner_services;
create policy "staff read partner services" on public.partner_services for select using (public.is_staff());
drop policy if exists "staff edit partner services" on public.partner_services;
create policy "staff edit partner services" on public.partner_services for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff add partner services" on public.partner_services;
create policy "staff add partner services" on public.partner_services for insert with check (public.is_staff());
-- Families never read this table (it holds partner emails); the labels they
-- see are in the app itself.

create table if not exists public.family_service_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  service_key text not null references public.partner_services(key),
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  requested_at timestamptz not null default now(),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'no_contact', 'failed')),
  email_to text,
  email_sent_at timestamptz,
  email_error text,
  unique (family_id, service_key)
);
create index if not exists idx_family_service_requests_family on public.family_service_requests(family_id);

alter table public.family_service_requests enable row level security;

drop policy if exists "family reads own service requests" on public.family_service_requests;
create policy "family reads own service requests" on public.family_service_requests
  for select using (family_id in (select id from public.families where account_user_id = auth.uid()));

drop policy if exists "staff read service requests" on public.family_service_requests;
create policy "staff read service requests" on public.family_service_requests for select using (public.is_staff());

drop policy if exists "staff update service requests" on public.family_service_requests;
create policy "staff update service requests" on public.family_service_requests
  for update using (public.is_staff()) with check (public.is_staff());
-- Families don't insert directly: the /api/request-introduction function
-- does it (service role) after checking who they are, then sends the email.

notify pgrst, 'reload schema';
