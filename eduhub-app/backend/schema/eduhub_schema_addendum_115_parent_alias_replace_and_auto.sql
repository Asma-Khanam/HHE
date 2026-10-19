-- ============================================================================
-- Addendum 115 — 2026-10-19: replace a parent's application address with a
-- hand-made one (A7) and create addresses automatically (A6)
--
-- Why
-- ---
-- Sarah Bentley's team made their own address
-- (sarahbentley3734@applications.heatherharries.com) because nobody had
-- generated one. Replies to it reached the catch-all but were never logged,
-- as it wasn't saved on the parent. Also, staff keep forgetting to press
-- "Create address".
--
-- What this adds
-- --------------
--   * parents.previous_aliases — old addresses stay routable, so mail still
--     sent to a replaced address still lands on the Emails tab. Nothing is
--     ever deleted.
--   * set_parent_custom_alias(parent, alias) — staff only; checks the format
--     and that nobody else (parent, family, or an old address) has it.
--   * log_application_email_full now also matches previous_aliases.
--   * A trigger that creates an address + password the moment a parent has a
--     name and no address, and a one-off backfill for existing parents.
--
-- HOW TO RUN: Supabase → SQL Editor → paste this whole file → Run. Safe to
-- re-run. Needs addenda 7, 42, 43 and 77.
-- ============================================================================

alter table public.parents add column if not exists previous_aliases text[] not null default '{}';

-- ---------------------------------------------------------------- helpers
create or replace function public.alias_in_use(p_alias text, p_except_parent uuid default null)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.parents
                 where (id is distinct from p_except_parent)
                   and (application_alias = p_alias or p_alias = any(previous_aliases)))
      or exists (select 1 from public.families where application_alias = p_alias);
$$;
revoke execute on function public.alias_in_use(text, uuid) from public, anon, authenticated;

create or replace function public.random_application_password()
returns text
language plpgsql
as $$
declare
  letters text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  digits text := '23456789';
  symbols text := '!@#$%';
  allc text;
  pw text;
begin
  allc := letters || digits || symbols;
  pw := substr(letters, 1 + floor(random() * 23)::int, 1)
     || substr(upper(letters), 1 + floor(random() * 23)::int, 1)
     || substr(digits, 1 + floor(random() * 8)::int, 1)
     || substr(symbols, 1 + floor(random() * 5)::int, 1);
  for i in 1..8 loop
    pw := pw || substr(allc, 1 + floor(random() * length(allc))::int, 1);
  end loop;
  return pw;
end;
$$;

-- ----------------------------------------------------- A7: replace address
create or replace function public.set_parent_custom_alias(p_parent_id uuid, p_alias text)
returns public.parents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alias text := lower(btrim(coalesce(p_alias, '')));
  v_row public.parents;
begin
  if not public.is_staff() then
    raise exception 'Only staff can change an application address.';
  end if;

  -- Allow pasting the whole address.
  v_alias := regexp_replace(v_alias, '@applications\.heatherharries\.com$', '');

  if v_alias !~ '^[a-z0-9][a-z0-9._-]{1,62}$' then
    raise exception 'Use only letters, numbers, dots, dashes or underscores before the @ (at least 2 characters).';
  end if;

  select * into v_row from public.parents where id = p_parent_id for update;
  if not found then
    raise exception 'Parent not found.';
  end if;

  if v_row.application_alias = v_alias then
    return v_row;
  end if;

  if public.alias_in_use(v_alias, p_parent_id) then
    raise exception '%@applications.heatherharries.com is already used by someone else.', v_alias;
  end if;

  update public.parents
     set previous_aliases = case
           when application_alias is not null and not (application_alias = any(previous_aliases))
             then previous_aliases || application_alias
           else previous_aliases end,
         application_alias = v_alias,
         application_alias_status = 'active',
         application_password = coalesce(application_password, public.random_application_password())
   where id = p_parent_id
   returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.set_parent_custom_alias(uuid, text) from public, anon;
grant execute on function public.set_parent_custom_alias(uuid, text) to authenticated;

-- ------------------------------------------- inbound mail also finds old ones
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
    from public.parents
    where application_alias = p_alias or p_alias = any(previous_aliases)
    limit 1;
  end if;

  if v_family_id is null then
    return jsonb_build_object('logged', false, 'reason', 'no matching alias');
  end if;

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
                            'alias_active', v_alias_status = 'active');
end;
$$;
revoke execute on function public.log_application_email_full(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------- A6: auto-create address
-- Same shape as the app's own generator: first initial + surname, letters
-- only, max 8 characters (some school forms reject longer emails).
create or replace function public.parents_auto_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  words text[];
  first_w text;
  last_w text;
  base text;
  cand text;
  n int := 0;
  clean text;
begin
  if new.application_alias is not null or btrim(coalesce(new.full_name, '')) = '' then
    return new;
  end if;

  words := regexp_split_to_array(btrim(new.full_name), '\s+');
  first_w := lower(regexp_replace(translate(words[1], 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-zA-Z]', '', 'g'));
  last_w := '';
  if array_length(words, 1) > 1 then
    last_w := lower(regexp_replace(translate(words[array_length(words, 1)], 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-zA-Z]', '', 'g'));
  end if;
  base := case when last_w <> '' then left(first_w, 1) || last_w else first_w end;
  if base = '' or base is null then base := 'parent'; end if;
  base := left(base, 8);

  cand := base;
  while public.alias_in_use(cand, new.id) loop
    n := n + 1;
    if n > 60 then return new; end if;  -- give up quietly; staff can still do it by hand
    clean := (10 + floor(random() * 90))::int::text;
    cand := left(base, 6) || clean;
  end loop;

  new.application_alias := cand;
  new.application_alias_status := 'active';
  if new.application_password is null then
    new.application_password := public.random_application_password();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_parents_auto_alias on public.parents;
create trigger trg_parents_auto_alias
before insert or update of full_name on public.parents
for each row execute function public.parents_auto_alias();

-- One-off backfill: any parent who already has a name but no address.
update public.parents set full_name = full_name
where application_alias is null and btrim(coalesce(full_name, '')) <> '';

notify pgrst, 'reload schema';
