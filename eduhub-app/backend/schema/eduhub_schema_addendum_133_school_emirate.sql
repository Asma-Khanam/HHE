-- Addendum 133 (22 Oct 2026): which emirate each school is in.
--
-- Adds schools.emirate (one of the seven emirates) and fills it in for every
-- school it can recognise from the school's area, address or name. Schools it
-- cannot recognise stay empty (they show under "No emirate yet" once the tabs
-- are built) and are set by hand. Never overwrites an emirate already set.
-- Safe to re-run.

alter table public.schools add column if not exists emirate text;

alter table public.schools drop constraint if exists schools_emirate_check;
alter table public.schools add constraint schools_emirate_check
  check (emirate is null or emirate in (
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'
  ));

create index if not exists idx_schools_emirate on public.schools(emirate);

-- Step 1: the other emirates, matched on area + address (named places only).
update public.schools s set emirate = m.e
from (
  select id,
    case
      when t ~ '\m(abu dhabi|al ain|yas island|saadiyat|khalifa city|al reem|masdar|mussafah|al raha|al mushrif|al bateen|al maryah)\M' then 'Abu Dhabi'
      when t ~ '\m(sharjah|muwaileh|al majaz|al qasimia)\M' then 'Sharjah'
      when t ~ '\majman\M' then 'Ajman'
      when t ~ '\m(ras al khaimah|ras al-khaimah|rak)\M' then 'Ras Al Khaimah'
      when t ~ '\mfujairah\M' then 'Fujairah'
      when t ~ '\m(umm al quwain|umm al quain|uaq)\M' then 'Umm Al Quwain'
    end as e
  from (
    select id, lower(coalesce(area, '') || ' ' || coalesce(address, '')) as t from public.schools
  ) x
) m
where s.id = m.id and s.emirate is null and m.e is not null;

-- Step 2: Dubai, matched on area + address.
update public.schools s set emirate = 'Dubai'
from (select id, lower(coalesce(area, '') || ' ' || coalesce(address, '')) as t from public.schools) x
where s.id = x.id and s.emirate is null
  and x.t ~ '(dubai|barsha|al safa|umm suqeim|umm al sheif|mirdif|mirdiff|jumeir|jabal ali|emirates hills|festival city|arabian ranches|tilal al ghaf|sustainable city|meadows|the greens|sobha|hartland|oud metha|nad al sheba|nadd al shiba|sports city|silicon oasis|investment park|bur dubai|warqa|sufouh|safouh|khail|jaddaf|academic city|diac|mudon|motor city|damac hills|furjan|jumeirah village|jvc|jvt|the springs|the lakes|dubai hills|meydan|business bay|deira|karama|quoz|al wasl|nad al hamar|rashidiya|qusais|marina|palm|dubailand|wadi al safa|remraam|town square|mizhar|twar|tecom|discovery gardens|international city|garhoud|hatta|the villa|al sufouh)';

-- Step 3: anything left, try the school's name.
update public.schools s set emirate = case
    when lower(s.name) ~ '(abu dhabi|al ain)' then 'Abu Dhabi'
    when lower(s.name) ~ 'sharjah' then 'Sharjah'
    when lower(s.name) ~ 'ajman' then 'Ajman'
    when lower(s.name) ~ '(ras al khaimah|rak)' then 'Ras Al Khaimah'
    when lower(s.name) ~ 'fujairah' then 'Fujairah'
    when lower(s.name) ~ '(umm al quwain|uaq)' then 'Umm Al Quwain'
    when lower(s.name) ~ 'dubai' then 'Dubai'
  end
where s.emirate is null
  and lower(s.name) ~ '(abu dhabi|al ain|sharjah|ajman|ras al khaimah|rak|fujairah|umm al quwain|uaq|dubai)';

notify pgrst, 'reload schema';

-- Result: how many schools per emirate, and the names of any it could not place.
select coalesce(emirate, 'No emirate yet') as emirate,
       count(*) as schools,
       case when emirate is null then string_agg(name || ' (' || coalesce(area, '?') || ')', ', ' order by name) end as to_set_by_hand
from public.schools
group by emirate
order by count(*) desc;
