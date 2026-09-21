-- Addendum 67: currency for a school's application fee and deposit
alter table public.schools add column if not exists fee_currency text not null default 'AED';
notify pgrst, 'reload schema';
