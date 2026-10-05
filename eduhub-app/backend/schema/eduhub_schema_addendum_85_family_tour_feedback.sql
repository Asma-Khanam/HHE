-- Addendum 85 (5 Oct 2026): families review their school tours.
--
-- Heather's meeting: a Feedback tab that gathers family tour reviews for
-- each school, and feedback from the client dashboard syncs to both the
-- family's record and the school's record.
--
-- The family writes to their own school_shortlist row (one row per family
-- and school), so the same review is automatically on the family's School
-- visits tab AND on that school's new Feedback tab -- no copying. These
-- columns are separate from the staff note (feedback_text), so neither
-- overwrites the other.
--
-- Families can only READ school_shortlist, so one function is their only
-- way to write, and only these three columns, only on their own rows.
-- Safe to re-run.

alter table public.school_shortlist
  add column if not exists family_feedback_rating smallint check (family_feedback_rating between 1 and 5),
  add column if not exists family_feedback_text text,
  add column if not exists family_feedback_at timestamptz;

create or replace function public.family_submit_tour_feedback(p_shortlist_id uuid, p_rating smallint, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Rating must be 1 to 5';
  end if;

  update public.school_shortlist s
     set family_feedback_rating = p_rating,
         family_feedback_text = nullif(btrim(coalesce(p_text, '')), ''),
         family_feedback_at = now()
   where s.id = p_shortlist_id
     and s.family_id in (select id from public.families where account_user_id = auth.uid());

  if not found then
    raise exception 'Not allowed';
  end if;
end;
$$;

grant execute on function public.family_submit_tour_feedback(uuid, smallint, text) to authenticated;

notify pgrst, 'reload schema';
