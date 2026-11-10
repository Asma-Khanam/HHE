-- 157: WhatsApp tab.
-- Every 1-to-1 WhatsApp message with a family is stored here by the server and
-- shown on the consultant site's WhatsApp tab, like the Emails tab. A message
-- is matched to a family by the sender's phone number against the parents'
-- phone numbers; anything that does not match shows as "Not filed" until a
-- consultant files it. Families can never read this table.
-- Safe to re-run.

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text unique,
  contact_phone text not null,
  contact_name text,
  family_id uuid references public.families(id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  msg_type text not null default 'text',
  body text,
  media_name text,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  status text check (status in ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_msgs_phone_time on public.whatsapp_messages (contact_phone, sent_at desc);
create index if not exists idx_wa_msgs_family on public.whatsapp_messages (family_id);

-- A number a consultant has filed to a family by hand, so later messages follow it.
create table if not exists public.whatsapp_contacts (
  contact_phone text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_contacts enable row level security;

drop policy if exists "staff read whatsapp messages" on public.whatsapp_messages;
create policy "staff read whatsapp messages" on public.whatsapp_messages
  for select using (public.is_staff());
drop policy if exists "staff update whatsapp messages" on public.whatsapp_messages;
create policy "staff update whatsapp messages" on public.whatsapp_messages
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff manage whatsapp contacts" on public.whatsapp_contacts;
create policy "staff manage whatsapp contacts" on public.whatsapp_contacts
  for all using (public.is_staff()) with check (public.is_staff());

-- Messages are only ever added by the server (the service role skips these policies).

create or replace function public.wa_digits(p text)
returns text
language sql
immutable
as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

-- Which family does this number belong to? A number filed by hand wins; otherwise
-- the parents' phone numbers (last 9 digits, so 050... and +97150... both match).
-- Null if no family or more than one family matches.
create or replace function public.wa_match_family(p_phone text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_family uuid;
  v_digits text := public.wa_digits(p_phone);
begin
  select family_id into v_family from public.whatsapp_contacts where contact_phone = v_digits;
  if v_family is not null then return v_family; end if;

  if length(v_digits) < 7 then return null; end if;

  select case when count(distinct family_id) = 1 then (array_agg(family_id))[1] end
  into v_family
  from public.parents
  where length(public.wa_digits(phone)) >= 7
    and right(public.wa_digits(phone), 9) = right(v_digits, 9);
  return v_family;
end;
$$;

create or replace function public.whatsapp_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.contact_phone := public.wa_digits(new.contact_phone);
  if new.family_id is null then
    new.family_id := public.wa_match_family(new.contact_phone);
  end if;
  -- Messages we send ourselves do not count as unread.
  if new.direction = 'out' and new.read_at is null then
    new.read_at := new.sent_at;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_before_insert_trg on public.whatsapp_messages;
create trigger whatsapp_messages_before_insert_trg
  before insert on public.whatsapp_messages
  for each row execute function public.whatsapp_messages_before_insert();

-- One row per conversation for the list on the left of the tab.
create or replace view public.whatsapp_conversations
with (security_invoker = true) as
select distinct on (m.contact_phone)
  m.contact_phone,
  (select n.contact_name from public.whatsapp_messages n
    where n.contact_phone = m.contact_phone and n.contact_name is not null
    order by n.sent_at desc limit 1) as contact_name,
  m.family_id,
  m.sent_at as last_at,
  m.direction as last_direction,
  m.msg_type as last_type,
  m.body as last_body,
  (select count(*) from public.whatsapp_messages u
    where u.contact_phone = m.contact_phone and u.direction = 'in' and u.read_at is null) as unread
from public.whatsapp_messages m
order by m.contact_phone, m.sent_at desc;

grant select on public.whatsapp_conversations to authenticated;

notify pgrst, 'reload schema';
