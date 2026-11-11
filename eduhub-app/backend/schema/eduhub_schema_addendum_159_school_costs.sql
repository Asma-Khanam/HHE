-- 159: Yearly tuition range and transport cost on each school, so a family's
-- shortlist can show the real first-year cost (tuition + application fee +
-- deposit + transport) instead of only the headline fee. All optional, AED
-- (or the school's fee_currency). Safe to re-run.

alter table public.schools add column if not exists tuition_from numeric;
alter table public.schools add column if not exists tuition_to numeric;
alter table public.schools add column if not exists transport_per_year numeric;

comment on column public.schools.tuition_from is 'Lowest annual tuition across year groups.';
comment on column public.schools.tuition_to is 'Highest annual tuition across year groups.';
comment on column public.schools.transport_per_year is 'Typical school-bus cost per child per year.';

notify pgrst, 'reload schema';
