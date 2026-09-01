-- ============================================================================
-- Eduhub — sample/test data
-- Run this AFTER eduhub_schema.sql has already been run.
--
-- STEP 1 — create one test login first. This script can't create it for you:
-- Supabase keeps auth.users in a separate, protected system that INSERT
-- statements shouldn't touch directly (it bypasses Supabase's own auth
-- triggers). The supported way:
--   Supabase dashboard → Authentication → Users → Add user
--   Email: test.family1@heatherharries.com   Password: anything
--   Copy the UUID it shows you after creating it.
--
-- STEP 2 — paste that UUID over PASTE-TEST-USER-UUID-HERE below (appears TWICE
-- now — once for the family, once for Amina's parent row, same UUID both times),
-- then run this whole file in the SQL Editor.
--
-- Safe to run once. Running it twice creates a second duplicate test family —
-- delete the rows (or just the family, cascades will clean up the rest) before
-- re-running if you want a clean slate.
-- ============================================================================

do $$
declare
  v_family_id uuid;
  v_child_ids uuid[] := array[]::uuid[];
  v_child_id uuid;
  v_school1 uuid;
  v_school2 uuid;
  i int;
begin
  insert into public.families (account_user_id, home_address)
  values ('PASTE-TEST-USER-UUID-HERE', '12 Example Street, Dubai, UAE')
  returning id into v_family_id;

  -- Amina is both the account holder (user_id set, matches families.account_user_id
  -- above) AND parent #1 — this is the normal case: one parent signs up and IS one
  -- of the two parents. Farhan is entered as information only — user_id stays NULL
  -- since he never created his own login.
  insert into public.parents
    (family_id, user_id, full_name, email, phone, nationality, religion, first_language, second_language, employer_name, occupation_designation, eid)
  values
    (v_family_id, 'PASTE-TEST-USER-UUID-HERE', 'Amina Khan', 'amina.khan@example.com', '+971 50 123 4567', 'Pakistani', 'Islam', 'Urdu', 'English', 'Emirates Group', 'Finance Manager', '784-1985-1234567-1'),
    (v_family_id, null, 'Farhan Khan', 'farhan.khan@example.com', '+971 50 765 4321', 'Pakistani', 'Islam', 'Urdu', 'English', 'DP World', 'Operations Lead', '784-1983-7654321-2');

  -- 10 children under ONE family — proves there's no cap at 2
  for i in 1..10 loop
    insert into public.children
      (family_id, full_name, date_of_birth, nationality, religion, first_language, second_language, medical_inclusion_needs, sports_hobbies_interests, eid)
    values (
      v_family_id,
      'Test Child ' || i,
      (date '2010-01-01' + (i * 250))::date,
      'Pakistani', 'Islam', 'Urdu', 'English',
      case when i = 1 then 'Mild peanut allergy' else null end,
      'Swimming, drawing',
      '784-20' || lpad(i::text, 2, '0') || '-1234567-' || i
    )
    returning id into v_child_id;
    v_child_ids := array_append(v_child_ids, v_child_id);
  end loop;

  insert into public.current_schools (child_id, school_name, contact_email, reference_status)
  values
    (v_child_ids[1], 'Sunrise British School', 'admissions@sunrisebs.example', 'not_requested'),
    (v_child_ids[2], 'Sunrise British School', 'admissions@sunrisebs.example', 'requested');

  insert into public.schools (name, location, notes)
  values ('Greenwood International School', 'Dubai, UAE', 'Rolling admissions, strong STEM program')
  returning id into v_school1;

  insert into public.schools (name, location, notes)
  values ('Horizon Academy', 'Abu Dhabi, UAE', 'Requires entrance assessment for Year 3+')
  returning id into v_school2;

  insert into public.applications (child_id, school_id, status, notes)
  values
    (v_child_ids[1], v_school1, 'submitted', 'Waiting on Greenwood to confirm interview slot.'),
    (v_child_ids[2], v_school2, 'draft', null);

  insert into public.documents (owner_type, owner_id, document_type, file_type, original_filename, status)
  values
    ('child', v_child_ids[1], 'birth_certificate', 'application/pdf', 'child1_birth_certificate.pdf', 'received'),
    ('parent', (select id from public.parents where family_id = v_family_id limit 1), 'passport_copy', 'image/jpeg', 'parent1_passport.jpg', 'pending');

  raise notice 'Seed complete. family_id = %, children created = %', v_family_id, array_length(v_child_ids, 1);
end $$;

-- ============================================================================
-- Verification queries — run these after the block above
-- ============================================================================

-- should return 10
select count(*) as child_count from public.children;

-- confirms there is no row-count limit on children — only the expected
-- primary key and foreign key constraints show up here
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.children'::regclass;
