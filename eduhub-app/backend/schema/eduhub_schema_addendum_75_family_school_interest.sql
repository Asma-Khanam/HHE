-- Addendum 75: the family's own say on each shortlisted school (23 Sept 2026)
-- On "Your schools" a family can mark a school Keen / Maybe / Not for us, with
-- an optional note. Staff see it on the School visits tab. Separate from
-- family_decision (which staff set, and which drives applications).
-- Safe to re-run.

alter table public.school_shortlist
  add column if not exists family_interest text check (family_interest in ('keen', 'maybe', 'not_for_us')),
  add column if not exists family_interest_note text,
  add column if not exists family_interest_at timestamptz;

-- Families can only READ school_shortlist, so this one function is the only
-- way they can write -- and only these three columns, only on their own rows.
create or replace function public.family_set_school_interest(p_shortlist_id uuid, p_interest text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_interest is not null and p_interest not in ('keen', 'maybe', 'not_for_us') then
    raise exception 'Invalid choice';
  end if;

  update public.school_shortlist s
     set family_interest = p_interest,
         family_interest_note = nullif(btrim(coalesce(p_note, '')), ''),
         family_interest_at = now()
   where s.id = p_shortlist_id
     and s.family_id in (select id from public.families where account_user_id = auth.uid());

  if not found then
    raise exception 'Not allowed';
  end if;
end;
$$;

grant execute on function public.family_set_school_interest(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
