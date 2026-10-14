-- Addendum 107 (14 Oct 2026): a child under 10 can be asked to send a video
-- of themselves instead of an in-person/online assessment. We don't store
-- the video itself -- just that it was asked for, and when it was sent --
-- so the Assessment stage has something to show as "done" for this child.
--
-- Miss Lyndsay, 14 Oct 2026 (WhatsApp): "can we have a function if they
-- child needs to upload a video of themself (they ask for this if the child
-- is under 10 years old). It can be a box next to the in person tick box
-- which states if the child has been asked to send a video, and then a date
-- of when we have sent the video across." Clarified: "We don't need to
-- upload the video's we just need to document that this is the assessment
-- process for this child and when it is completed."

alter table public.applications add column if not exists assessment_video_requested boolean not null default false;
alter table public.applications add column if not exists assessment_video_sent_at date;

notify pgrst, 'reload schema';
