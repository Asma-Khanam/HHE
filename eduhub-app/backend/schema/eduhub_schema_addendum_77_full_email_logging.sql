-- ============================================================================
-- Addendum 77 — 2026-09-24: keep the WHOLE email, not a 400-character preview
--
-- Why
-- ---
-- Until now log_application_email only kept a 400-char plain-text snippet,
-- so school emails showed up on the Emails tab as one squashed line full of
-- "![](https://...)" link junk. The founders want each email to read exactly
-- as it was sent (layout, links, signature, images) and to be searchable.
--
-- What this adds
-- --------------
--   * case_notes gets email_* columns: sender name + address, to/cc, the
--     full HTML, the full plain text, attachments list and the message id.
--   * A private storage bucket "email-attachments" (staff-only) so files a
--     school attaches can be opened from the Emails tab.
--   * log_application_email_full(...) — the webhook now calls this one. The
--     old log_application_email(4 args) is left in place untouched, so
--     nothing breaks if the webhook is deployed before this SQL is run.
--   * The same message arriving twice (ImprovMX retry) is only logged once.
--
-- HOW TO RUN:
--   Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run. Needs addendum 7, 42 and 49 already applied.
-- ============================================================================

alter table public.case_notes add column if not exists email_from text;
alter table public.case_notes add column if not exists email_from_name text;
alter table public.case_notes add column if not exists email_to text;
alter table public.case_notes add column if not exists email_cc text;
alter table public.case_notes add column if not exists email_html text;
alter table public.case_notes add column if not exists email_text text;
alter table public.case_notes add column if not exists email_attachments jsonb not null default '[]'::jsonb;
alter table public.case_notes add column if not exists email_message_id text;

comment on column public.case_notes.email_html is
  'Full HTML of an inbound email, exactly as received. Only ever rendered inside a sandboxed iframe (no scripts).';
comment on column public.case_notes.email_attachments is
  'List of {name, type, size, path} — path is inside the private email-attachments bucket.';

create unique index if not exists uq_case_notes_email_message
  on public.case_notes (family_id, email_message_id)
  where email_message_id is not null;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

drop policy if exists "email_attachments_staff_read" on storage.objects;
create policy "email_attachments_staff_read"
on storage.objects
for select
using (bucket_id = 'email-attachments' and public.is_staff());
-- No insert/update/delete policy on purpose: only the webhook (service role)
-- ever writes here, and nobody deletes from the UI.

-- ---------------------------------------------------------------- function
create or replace function public.log_application_email_full(
  p_alias text,
  p_from text,
  p_from_name text,
  p_to text,
  p_cc text,
  p_subject text,
  p_text text,
  p_html text,
  p_message_id text
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
begin
  select id, application_alias_status into v_family_id, v_alias_status
  from public.families where application_alias = p_alias;

  if not found then
    select family_id, application_alias_status into v_family_id, v_alias_status
    from public.parents where application_alias = p_alias;
  end if;

  if v_family_id is null then
    return jsonb_build_object('logged', false, 'reason', 'no matching alias');
  end if;

  -- Already logged (ImprovMX retried the same message)?
  if p_message_id is not null then
    select id into v_note_id from public.case_notes
    where family_id = v_family_id and email_message_id = p_message_id;
    if found then
      return jsonb_build_object('logged', true, 'duplicate', true, 'note_id', v_note_id, 'family_id', v_family_id);
    end if;
  end if;

  -- body keeps the old "<short preview>\n\nFrom: <address>" shape so the
  -- Today feed and anything else reading case_notes.body keeps working.
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
                            'alias_active', v_alias_status = 'active');
end;
$$;

revoke execute on function public.log_application_email_full(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
