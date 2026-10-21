-- ============================================================================
-- Addendum 124 — 21 Oct 2026: never lose an inbound email, and file replies by thread
--
-- Why
-- ---
-- Goodburn (and Bentley before them): a school replied to an address that is not
-- the family's application address (the generic one an old email went out from,
-- or relocate@ when someone wrote from Titan). The database found no family and
-- the email was dropped without a trace; it only survived in the Titan inbox.
--
-- What this adds
-- --------------
--   * unmatched_emails  - every inbound email that matches no family is KEPT here,
--                         with who it came from, to whom and the full text, so
--                         staff can file it under the right family.
--   * log_application_email_full now has two more (optional) inputs, the email's
--     In-Reply-To and References headers. If the address matches nobody, it looks
--     for the message being replied to among emails already on a family's Emails
--     tab (sent from there or received), and files the reply under that family.
--   * file_unmatched_email(id, family) / dismiss_unmatched_email(id): staff only.
--
-- Needs addenda 7, 77 and 115. Safe to re-run.
-- HOW TO RUN: Supabase -> SQL Editor -> paste this whole file -> Run.
-- ============================================================================

-- 1. Where unmatched emails are kept ----------------------------------------------
create table if not exists public.unmatched_emails (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  alias text,                      -- the part before @ of the address it was sent to
  email_from text,
  email_from_name text,
  email_to text,
  email_cc text,
  subject text,
  email_text text,
  email_html text,
  email_message_id text,
  in_reply_to text,
  attachment_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'filed', 'dismissed')),
  filed_family_id uuid references public.families(id) on delete set null,
  filed_note_id uuid,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz
);
create unique index if not exists idx_unmatched_emails_message
  on public.unmatched_emails (email_message_id) where email_message_id is not null;
create index if not exists idx_unmatched_emails_open
  on public.unmatched_emails (received_at desc) where status = 'open';

alter table public.unmatched_emails enable row level security;
drop policy if exists "staff read unmatched emails" on public.unmatched_emails;
create policy "staff read unmatched emails" on public.unmatched_emails
  for select using (public.is_staff());
-- No insert/update/delete policies: only the webhook (server) and the functions below write.

-- 2. Find a family by the message an email replies to ------------------------------
-- Message IDs are compared without the < > around them, so "<abc@x>" == "abc@x".
create index if not exists idx_case_notes_message_id_plain
  on public.case_notes ((translate(email_message_id, '<> ', '')))
  where email_message_id is not null;

-- 3. The matching function, now with thread matching and a safety net ---------------
-- The old 9-argument version is dropped first so the webhook never meets two versions.
drop function if exists public.log_application_email_full(text, text, text, text, text, text, text, text, text);

create or replace function public.log_application_email_full(
  p_alias text,
  p_from text,
  p_from_name text,
  p_to text,
  p_cc text,
  p_subject text,
  p_text text,
  p_html text,
  p_message_id text,
  p_in_reply_to text default null,
  p_references text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_alias_status text;
  v_note_id uuid;
  v_snippet text;
  v_matched_by text := 'address';
  v_ids text[];
begin
  -- a) the family's own address (and any address that was replaced)
  select id, application_alias_status into v_family_id, v_alias_status
  from public.families where application_alias = p_alias;

  if not found then
    select family_id, application_alias_status into v_family_id, v_alias_status
    from public.parents
    where application_alias = p_alias or p_alias = any(previous_aliases)
    limit 1;
  end if;

  -- b) a reply to an email already on a family's Emails tab
  if v_family_id is null and (coalesce(p_in_reply_to, '') <> '' or coalesce(p_references, '') <> '') then
    select array_agg(distinct translate(x, '<> ', ''))
      into v_ids
    from unnest(regexp_split_to_array(coalesce(p_in_reply_to, '') || ' ' || coalesce(p_references, ''), '\s+')) as x
    where btrim(x) <> '';

    if v_ids is not null and array_length(v_ids, 1) > 0 then
      select n.family_id into v_family_id
      from public.case_notes n
      where n.email_message_id is not null
        and translate(n.email_message_id, '<> ', '') = any(v_ids)
      order by n.occurred_at desc
      limit 1;
      if v_family_id is not null then v_matched_by := 'reply_thread'; end if;
    end if;
  end if;

  -- c) nobody: keep it for staff instead of dropping it
  if v_family_id is null then
    insert into public.unmatched_emails (
      alias, email_from, email_from_name, email_to, email_cc, subject,
      email_text, email_html, email_message_id, in_reply_to
    )
    values (
      p_alias, p_from, nullif(btrim(coalesce(p_from_name, '')), ''), p_to, nullif(p_cc, ''), p_subject,
      p_text, p_html, p_message_id, nullif(p_in_reply_to, '')
    )
    on conflict (email_message_id) where email_message_id is not null do nothing;
    return jsonb_build_object('logged', false, 'unmatched', true, 'reason', 'no matching family');
  end if;

  -- Already logged (ImprovMX retried the same message)?
  if p_message_id is not null then
    select id into v_note_id from public.case_notes
    where family_id = v_family_id and email_message_id = p_message_id;
    if found then
      return jsonb_build_object('logged', true, 'duplicate', true, 'note_id', v_note_id, 'family_id', v_family_id);
    end if;
  end if;

  v_snippet := left(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'), 400);

  insert into public.case_notes (
    family_id, kind, body, subject, direction, occurred_at,
    email_from, email_from_name, email_to, email_cc,
    email_html, email_text, email_message_id
  )
  values (
    v_family_id, 'email',
    coalesce(nullif(btrim(v_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || coalesce(p_from, '(unknown sender)'),
    p_subject, 'inbound', now(),
    p_from, nullif(btrim(coalesce(p_from_name, '')), ''), p_to, nullif(p_cc, ''),
    p_html, p_text, p_message_id
  )
  returning id into v_note_id;

  return jsonb_build_object('logged', true, 'note_id', v_note_id, 'family_id', v_family_id,
                            'matched_by', v_matched_by,
                            'alias_active', coalesce(v_alias_status = 'active', true));
end;
$$;
revoke execute on function public.log_application_email_full(text, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- 4. Staff files an unmatched email under a family --------------------------------
create or replace function public.file_unmatched_email(p_id uuid, p_family uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.unmatched_emails%rowtype;
  v_note uuid;
  v_snippet text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into u from public.unmatched_emails where id = p_id for update;
  if not found then raise exception 'That email was not found.'; end if;
  if u.status <> 'open' then raise exception 'That email has already been handled.'; end if;
  if not exists (select 1 from public.families where id = p_family) then raise exception 'Choose a family.'; end if;

  v_snippet := left(regexp_replace(coalesce(u.email_text, ''), '\s+', ' ', 'g'), 400);

  insert into public.case_notes (
    family_id, kind, body, subject, direction, occurred_at,
    email_from, email_from_name, email_to, email_cc,
    email_html, email_text, email_message_id
  )
  values (
    p_family, 'email',
    coalesce(nullif(btrim(v_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || coalesce(u.email_from, '(unknown sender)'),
    u.subject, 'inbound', u.received_at,
    u.email_from, u.email_from_name, u.email_to, u.email_cc,
    u.email_html, u.email_text, u.email_message_id
  )
  returning id into v_note;

  update public.unmatched_emails
     set status = 'filed', filed_family_id = p_family, filed_note_id = v_note,
         handled_by = auth.uid(), handled_at = now()
   where id = p_id;

  return v_note;
end;
$$;
revoke execute on function public.file_unmatched_email(uuid, uuid) from public, anon;
grant execute on function public.file_unmatched_email(uuid, uuid) to authenticated;

-- 5. Staff dismisses one (spam, a newsletter, nothing to do with a family) ---------
create or replace function public.dismiss_unmatched_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update public.unmatched_emails
     set status = 'dismissed', handled_by = auth.uid(), handled_at = now()
   where id = p_id and status = 'open';
end;
$$;
revoke execute on function public.dismiss_unmatched_email(uuid) from public, anon;
grant execute on function public.dismiss_unmatched_email(uuid) to authenticated;

notify pgrst, 'reload schema';

-- 6. Attachments on kept emails -----------------------------------------------------
-- The webhook saves them under unmatched/<id>/ in the email-attachments bucket; filing
-- the email copies the list onto the family's note so they open from there too.
alter table public.unmatched_emails add column if not exists email_attachments jsonb not null default '[]'::jsonb;

create or replace function public.file_unmatched_email(p_id uuid, p_family uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.unmatched_emails%rowtype;
  v_note uuid;
  v_snippet text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into u from public.unmatched_emails where id = p_id for update;
  if not found then raise exception 'That email was not found.'; end if;
  if u.status <> 'open' then raise exception 'That email has already been handled.'; end if;
  if not exists (select 1 from public.families where id = p_family) then raise exception 'Choose a family.'; end if;

  v_snippet := left(regexp_replace(coalesce(u.email_text, ''), '\s+', ' ', 'g'), 400);

  insert into public.case_notes (
    family_id, kind, body, subject, direction, occurred_at,
    email_from, email_from_name, email_to, email_cc,
    email_html, email_text, email_message_id, email_attachments
  )
  values (
    p_family, 'email',
    coalesce(nullif(btrim(v_snippet), ''), '(no preview available)') || E'\n\nFrom: ' || coalesce(u.email_from, '(unknown sender)'),
    u.subject, 'inbound', u.received_at,
    u.email_from, u.email_from_name, u.email_to, u.email_cc,
    u.email_html, u.email_text, u.email_message_id,
    u.email_attachments
  )
  returning id into v_note;

  update public.unmatched_emails
     set status = 'filed', filed_family_id = p_family, filed_note_id = v_note,
         handled_by = auth.uid(), handled_at = now()
   where id = p_id;

  return v_note;
end;
$$;
revoke execute on function public.file_unmatched_email(uuid, uuid) from public, anon;
grant execute on function public.file_unmatched_email(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
