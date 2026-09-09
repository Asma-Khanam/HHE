-- ============================================================================
-- Schema addendum 4 — per-person addresses            2026-09-02
--
-- Why this exists
-- ---------------
-- Until now the whole family shared one address: families.home_address.
-- Founder feedback on 2026-09-02: separated parents don't live at the same
-- address, and a child may live with one parent and not the other. A single
-- household address can't describe that, so each parent and each child now
-- gets an address of their own.
--
-- How it's stored
-- ---------------
-- Two columns per person:
--
--   address          the real, full address text — ALWAYS populated, even
--                    when it was copied from someone else. Anything reading
--                    these tables directly (the founders' portal, a CSV
--                    export, a school reference letter) gets a usable address
--                    without having to follow a reference to another row.
--
--   address_same_as  which address this one was copied from, or NULL/'' when
--                    the person has an address of their own:
--                      'household' — families.home_address
--                      'mother'    — the Mother parent row's address
--                      'father'    — the Father parent row's address
--                    This is what lets the form show the picker the way the
--                    family left it, and what keeps a copied address in step
--                    when its source is edited later.
--
-- families.home_address is unchanged and still the main household address —
-- it's the default every one of these points at.
--
-- Safe to run more than once (add column if not exists / drop-and-recreate
-- the constraints), and safe on live data: every existing row simply gets
-- NULL in both new columns, which the app reads as "no separate address
-- recorded yet" and falls back to the household address for.
-- ============================================================================

-- Parents -------------------------------------------------------------------
alter table public.parents add column if not exists address text;
alter table public.parents add column if not exists address_same_as text;

-- Children ------------------------------------------------------------------
alter table public.children add column if not exists address text;
alter table public.children add column if not exists address_same_as text;

-- Only the three known sources (or nothing) are valid. An empty string is
-- allowed as well as NULL because the form sends "" for "a different
-- address" rather than a SQL NULL.
alter table public.parents drop constraint if exists parents_address_same_as_check;
alter table public.parents
  add constraint parents_address_same_as_check
  check (address_same_as is null or address_same_as in ('', 'household', 'mother', 'father'));

alter table public.children drop constraint if exists children_address_same_as_check;
alter table public.children
  add constraint children_address_same_as_check
  check (address_same_as is null or address_same_as in ('', 'household', 'mother', 'father'));

-- Backfill: everyone who already exists lives at the household address until
-- someone says otherwise, which is what the app assumed before this change.
-- Only touches rows that have no address recorded, so re-running this after
-- families have entered real addresses can't overwrite them.
update public.parents p
   set address_same_as = 'household',
       address = f.home_address
  from public.families f
 where p.family_id = f.id
   and p.address is null
   and p.address_same_as is null;

update public.children c
   set address_same_as = 'household',
       address = f.home_address
  from public.families f
 where c.family_id = f.id
   and c.address is null
   and c.address_same_as is null;
