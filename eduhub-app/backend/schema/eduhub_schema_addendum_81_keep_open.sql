-- Addendum 81 (25 Sept 2026): a second school after a placement.
--
-- Today, once a child is placed, every other school/application for that
-- family closes and greys out automatically -- that's right for most
-- families, who are placed and done. But sometimes a family isn't happy
-- with the placement and wants to pursue another school through us
-- (e.g. a child placed at School A starts a fresh application at School B).
--
-- keep_open is a plain flag a consultant sets on one shortlist row or one
-- application: while set, that row is shown as open even though the child
-- is placed elsewhere. Nothing else changes -- the placement and every
-- other closed school keep their history exactly as before. The app sets
-- it automatically when a school is *added* after a placement already
-- exists (the act of adding it is the explicit signal), and a consultant
-- can also flip it on an already-closed row from "Keep this school/
-- application open too".

alter table public.school_shortlist
  add column if not exists keep_open boolean not null default false;

alter table public.applications
  add column if not exists keep_open boolean not null default false;

notify pgrst, 'reload schema';
