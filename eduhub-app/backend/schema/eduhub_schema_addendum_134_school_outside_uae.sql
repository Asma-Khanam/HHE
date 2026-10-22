-- Addendum 134 (22 Oct 2026): schools outside the UAE (for example UK boarding
-- schools). Adds "Outside UAE" as an allowed emirate value and sets it for
-- schools whose area or address is in the UK. Run after addendum 133. Safe to re-run.

alter table public.schools drop constraint if exists schools_emirate_check;
alter table public.schools add constraint schools_emirate_check
  check (emirate is null or emirate in (
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Outside UAE'
  ));

update public.schools
   set emirate = 'Outside UAE'
 where emirate is null
   and lower(coalesce(area, '') || ' ' || coalesce(address, '')) ~
       '\m(uk|u\.k\.|united kingdom|england|scotland|wales|surrey|kent|sussex|london|hampshire|berkshire|oxfordshire|oxford|cambridge|essex|dorset|devon|somerset|yorkshire|cheshire|lancashire|hertfordshire|buckinghamshire|wiltshire|gloucestershire|usa|united states|canada|switzerland|india|pakistan|egypt|jordan|lebanon)\M';

notify pgrst, 'reload schema';

-- Anything still without an emirate (set these by hand):
select name, area, address
from public.schools
where emirate is null
order by name;
