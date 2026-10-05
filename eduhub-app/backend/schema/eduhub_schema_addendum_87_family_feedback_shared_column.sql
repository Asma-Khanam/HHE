-- Addendum 87 (5 Oct 2026): one feedback box per school visit.
--
-- A family's tour review now goes into the same Feedback column the
-- consultants use on the School visits tab (school_shortlist.feedback_text /
-- feedback_rating, tagged feedback_by = 'family'). If a family doesn't leave
-- one, a consultant writes it there instead (tagged 'staff'). A family can't
-- overwrite what a consultant wrote. The school's Feedback tab reads the same
-- column, so it shows up there too.
-- (The family_feedback_* columns from addendum 85 are no longer used.)
-- Safe to re-run.

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
     set feedback_rating = p_rating,
         feedback_text = nullif(btrim(coalesce(p_text, '')), ''),
         feedback_by = case when p_rating is null and nullif(btrim(coalesce(p_text, '')), '') is null then null else 'family' end,
         feedback_at = now()
   where s.id = p_shortlist_id
     and s.family_id in (select id from public.families where account_user_id = auth.uid())
     and (s.feedback_by is distinct from 'staff' or s.feedback_text is null);

  if not found then
    raise exception 'Not allowed';
  end if;
end;
$$;

grant execute on function public.family_submit_tour_feedback(uuid, smallint, text) to authenticated;

-- Anything already saved in the addendum 85 columns moves across.
update public.school_shortlist
   set feedback_text = coalesce(feedback_text, family_feedback_text),
       feedback_rating = coalesce(feedback_rating, family_feedback_rating),
       feedback_by = case when feedback_text is null then 'family' else feedback_by end,
       feedback_at = coalesce(feedback_at, family_feedback_at)
 where (family_feedback_text is not null or family_feedback_rating is not null)
   and feedback_text is null;

notify pgrst, 'reload schema';
