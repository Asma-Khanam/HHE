-- Addendum 88 (5 Oct 2026): the family's note IS the feedback.
--
-- The note a family writes under "Your view" on a school now goes straight
-- into the Feedback box on that family's School visits tab
-- (school_shortlist.feedback_text, tagged feedback_by = 'family'). If they
-- don't write one, a consultant types it into the same box ('staff'). A
-- family never overwrites what a consultant wrote. The school's Feedback
-- tab reads the same column.
-- Needs addenda 38 and 75. Safe to re-run.

create or replace function public.family_set_school_interest(p_shortlist_id uuid, p_interest text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_interest is not null and p_interest not in ('keen', 'maybe', 'not_for_us') then
    raise exception 'Invalid choice';
  end if;

  update public.school_shortlist s
     set family_interest = p_interest,
         family_interest_note = v_note,
         family_interest_at = now(),
         feedback_text = case when s.feedback_by is distinct from 'staff' or s.feedback_text is null
                              then v_note else s.feedback_text end,
         feedback_by = case when s.feedback_by is distinct from 'staff' or s.feedback_text is null
                            then (case when v_note is null and s.feedback_rating is null then null else 'family' end)
                            else s.feedback_by end,
         feedback_at = case when s.feedback_by is distinct from 'staff' or s.feedback_text is null
                            then now() else s.feedback_at end
   where s.id = p_shortlist_id
     and s.family_id in (select id from public.families where account_user_id = auth.uid());

  if not found then
    raise exception 'Not allowed';
  end if;
end;
$$;

grant execute on function public.family_set_school_interest(uuid, text, text) to authenticated;

-- Notes families already wrote move into the Feedback box.
update public.school_shortlist
   set feedback_text = family_interest_note,
       feedback_by = 'family',
       feedback_at = coalesce(family_interest_at, now())
 where family_interest_note is not null and feedback_text is null;

notify pgrst, 'reload schema';
