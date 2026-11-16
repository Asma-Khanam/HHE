-- Addendum 162: Suggested schools decisions can be for one child (Nov 2026)
-- The Suggested schools card now has a tab per child as well as "Together".
-- A decision (reject or hold) can apply to the whole family (child_id empty)
-- or to just one child, so a school ruled out for one child still shows for
-- the others. Decisions made before this keep applying to the whole family.
-- Safe to run more than once.

alter table public.school_suggestion_decisions
  add column if not exists child_id uuid references public.children(id) on delete cascade;

alter table public.school_suggestion_decisions
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.school_suggestion_decisions
  drop constraint if exists school_suggestion_decisions_pkey;

alter table public.school_suggestion_decisions
  add constraint school_suggestion_decisions_pkey primary key (id);

create unique index if not exists school_suggestion_decisions_scope_uidx
  on public.school_suggestion_decisions (family_id, school_id, coalesce(child_id, '00000000-0000-0000-0000-000000000000'::uuid));

notify pgrst, 'reload schema';
