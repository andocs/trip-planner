-- RLS proof for the owner / viewer model. Works in the Supabase SQL editor and in local `psql`.
-- It creates throwaway users, runs every check as each user, and ALWAYS rolls back by raising an
-- exception at the end. Read the final message: "RLS CHECK PASSED (n checks)" or "RLS CHECK FAILED: ...".
-- Needs migrations 1..13 applied. Does not need any real admin: it inserts a throwaway admin email.

do $$
declare
  owner_u uuid := gen_random_uuid();     -- Google account in app_admins
  other_g uuid := gen_random_uuid();     -- Google account NOT in app_admins
  viewer_u uuid := gen_random_uuid();    -- anonymous, joined via link
  stranger uuid := gen_random_uuid();    -- anonymous, never joined
  legacy_u uuid := gen_random_uuid();    -- pre-revision member row (role defaulted to viewer)
  fake_admin uuid := gen_random_uuid();  -- anonymous session carrying an admin email
  trip_a uuid;
  trip_old uuid;
  trip_old_draft uuid;
  tok text;
  tok2 text;
  item_a uuid;      -- a draft attraction on trip_a
  item_f uuid;      -- a draft food place on trip_a
  item_old uuid;    -- an attraction on another trip (trip_old)
  stop_id uuid;
  conn_id uuid;     -- a commute connector on trip_a (migration 16)
  vote_o uuid;
  cm_o uuid;
  cm_v uuid;
  ref_id uuid;      -- a place link on item_a (migration 10)
  flight_id uuid;   -- a flight on trip_a (migration 12)
  flight_old uuid;  -- a flight on another trip
  ref_flight uuid;  -- a flight with a booking reference (migration 13)
  i int;
  n int;
  rc int;
  r text;
  ok boolean;
  failures text[] := '{}';
  checks int := 0;
  t text;
  child_tables text[] := array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'];

  -- claims builder
  c_owner text; c_other text; c_viewer text; c_stranger text; c_legacy text; c_fake text;
begin
  c_owner := json_build_object('sub', owner_u, 'role', 'authenticated', 'email', 'rls-owner@test.local',
    'is_anonymous', false, 'app_metadata', json_build_object('provider', 'google', 'providers', json_build_array('google')))::text;
  c_other := json_build_object('sub', other_g, 'role', 'authenticated', 'email', 'rls-other@test.local',
    'is_anonymous', false, 'app_metadata', json_build_object('provider', 'google', 'providers', json_build_array('google')))::text;
  c_viewer := json_build_object('sub', viewer_u, 'role', 'authenticated', 'is_anonymous', true,
    'app_metadata', json_build_object('provider', 'anonymous', 'providers', json_build_array('anonymous')))::text;
  c_stranger := json_build_object('sub', stranger, 'role', 'authenticated', 'is_anonymous', true,
    'app_metadata', json_build_object('provider', 'anonymous', 'providers', json_build_array('anonymous')))::text;
  c_legacy := json_build_object('sub', legacy_u, 'role', 'authenticated', 'is_anonymous', true,
    'app_metadata', json_build_object('provider', 'anonymous', 'providers', json_build_array('anonymous')))::text;
  c_fake := json_build_object('sub', fake_admin, 'role', 'authenticated', 'email', 'rls-owner@test.local', 'is_anonymous', true,
    'app_metadata', json_build_object('provider', 'anonymous', 'providers', json_build_array('anonymous')))::text;

  insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', anon, now(), now()
  from (values (owner_u, false), (other_g, false), (viewer_u, true), (stranger, true), (legacy_u, true), (fake_admin, true)) v(u, anon);
  insert into public.app_admins (email) values ('rls-owner@test.local');

  -- Fixtures (as the table owner): an old, unclaimed trip with a legacy member, and data to read.
  insert into public.trips (name) values ('Legacy trip') returning id into trip_old;
  insert into public.trip_members (trip_id, user_id) values (trip_old, legacy_u);          -- role defaults to 'viewer'
  insert into public.travelers (trip_id, name) values (trip_old, 'Legacy traveler');

  -- ============================== OWNER ==============================
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;

  checks := checks + 1;
  select public.is_admin() into ok;
  if not ok then failures := failures || 'owner should be admin'::text; end if;

  trip_a := public.create_trip('Owner trip');
  select join_token into tok from public.trips where id = trip_a;
  insert into public.travelers (trip_id, name) values (trip_a, 'Aq');
  insert into public.reminders (trip_id, text) values (trip_a, 'secret reminder');

  checks := checks + 1;
  select count(*) into n from public.categories where trip_id = trip_a;
  if n <> 8 then failures := failures || format('owner should see 8 default categories, saw %s', n); end if;

  checks := checks + 1;
  update public.trips set name = 'Renamed' where id = trip_a;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not update own trip'::text; end if;

  checks := checks + 1;
  begin
    insert into public.trips (name) values ('direct insert');
    failures := failures || 'owner could insert into trips directly'::text;
  exception when insufficient_privilege then null; end;

  checks := checks + 1;
  begin
    delete from public.trips where id = trip_a;
    failures := failures || 'owner could delete a trip directly'::text;
  exception when insufficient_privilege then null; end;

  checks := checks + 1;
  begin
    perform 1 from public.app_admins;
    failures := failures || 'client could read app_admins'::text;
  exception when insufficient_privilege then null; end;

  -- Claim the legacy trip
  checks := checks + 1;
  select count(*) into n from public.claimable_trips() where id = trip_old;
  if n <> 1 then failures := failures || 'admin should see the unclaimed legacy trip'::text; end if;
  perform public.claim_trip(trip_old);
  checks := checks + 1;
  begin
    perform public.claim_trip(trip_old);
    failures := failures || 'claim_trip worked twice'::text;
  exception when others then null; end;
  checks := checks + 1;
  select public.trip_role(trip_old) into r;
  if r is distinct from 'owner' then failures := failures || format('claimer should be owner, is %s', r); end if;
  checks := checks + 1;
  update public.travelers set name = 'Edited' where trip_id = trip_old;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'claimed owner could not edit legacy trip'::text; end if;

  -- ---- onboarding: trip_a was created as a draft ----
  checks := checks + 1;
  select status into r from public.trips where id = trip_a;
  if r is distinct from 'draft' then failures := failures || format('new trip should be a draft, is %s', r); end if;
  perform public.save_onboarding(trip_a, 3, '{"name":"Hanoi ''26","start_date":"2026-06-16","end_date":"2026-06-26","home_currency":"php","foreign_currency":"vnd","rate":0.002457,"budget":118165,"stops":[{"city":"Hanoi","country":"Vietnam","nights":3,"lat":21.03,"lng":105.85},{"city":"Sapa","nights":2},{"city":"  ","nights":1}],"travelers":["Aq"," Jam ",""]}'::jsonb);
  checks := checks + 1;
  select count(*) into n from public.destinations where trip_id = trip_a;
  if n <> 2 then failures := failures || format('save_onboarding should store 2 stops (blank skipped), stored %s', n); end if;
  checks := checks + 1;
  select count(*) into n from public.travelers where trip_id = trip_a and name in ('Aq', 'Jam');
  if n <> 2 then failures := failures || 'save_onboarding should replace travelers with Aq and Jam'; end if;
  checks := checks + 1;
  select home_currency || foreign_currency || onboarding_step into r from public.trips where id = trip_a;
  if r is distinct from 'PHPVND3' then failures := failures || format('draft fields not saved, got %s', r); end if;
  checks := checks + 1;
  begin perform public.save_onboarding(trip_a, 2, '{"rate":0}'::jsonb); failures := failures || 'a zero rate was accepted'::text;
  exception when check_violation then null; end;
  perform public.finish_onboarding(trip_a, true);
  checks := checks + 1;
  select status into r from public.trips where id = trip_a;
  if r is distinct from 'active' then failures := failures || 'finish_onboarding did not activate the trip'; end if;
  checks := checks + 1;
  select count(*) into n from public.packing_items where trip_id = trip_a;
  if n < 5 then failures := failures || 'starter checklist missing'; end if;
  checks := checks + 1;
  begin perform public.finish_onboarding(trip_a, false); failures := failures || 'finish_onboarding ran twice'::text;
  exception when sqlstate 'P0001' then null; end;
  checks := checks + 1;
  begin perform public.save_onboarding(trip_a, 1, '{"name":"x"}'::jsonb); failures := failures || 'save_onboarding changed a live trip'::text;
  exception when sqlstate 'P0001' then null; end;
  checks := checks + 1;
  select public.create_trip('second') into trip_old_draft;
  select status into r from public.trips where id = trip_old_draft;
  if r is distinct from 'draft' then failures := failures || 'second create_trip should be a draft'; end if;
  checks := checks + 1;
  if public.create_trip('third') is distinct from trip_old_draft then failures := failures || 'create_trip should return the existing draft'; end if;
  reset role;

  -- legacy member stays a viewer after the claim
  checks := checks + 1;
  select role into r from public.trip_members where trip_id = trip_old and user_id = legacy_u;
  if r is distinct from 'viewer' then failures := failures || 'claim changed the legacy member role'::text; end if;

  -- ============================== STRANGER ==============================
  perform set_config('request.jwt.claims', c_stranger, true);
  set local role authenticated;

  checks := checks + 1;
  select count(*) into n from public.trips;
  if n <> 0 then failures := failures || format('stranger sees %s trips', n); end if;
  foreach t in array child_tables loop
    checks := checks + 1;
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then failures := failures || format('stranger sees %s rows in %s', n, t); end if;
  end loop;
  checks := checks + 1;
  begin
    insert into public.travelers (trip_id, name) values (trip_a, 'intruder');
    failures := failures || 'stranger inserted a traveler'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select count(*) into n from public.trip_members;
  if n <> 0 then failures := failures || 'stranger sees trip_members'::text; end if;
  checks := checks + 1;
  begin perform public.create_trip('x'); failures := failures || 'stranger created a trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.regenerate_invite(trip_a); failures := failures || 'stranger replaced the invite link'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.claim_trip(trip_old); failures := failures || 'stranger claimed a trip'::text;
  exception when others then null; end;
  checks := checks + 1;
  select count(*) into n from public.claimable_trips();
  if n <> 0 then failures := failures || 'non-admin sees claimable trips'::text; end if;
  checks := checks + 1;
  begin perform public.join_trip('not-a-real-token'); failures := failures || 'bad token joined'::text;
  exception when sqlstate 'P0002' then null; end;
  reset role;

  -- ============================== TOKEN = VIEW ONLY ==============================
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  perform public.join_trip(tok);
  perform public.join_trip(tok);  -- idempotent

  checks := checks + 1;
  select public.trip_role(trip_a) into r;
  if r is distinct from 'viewer' then failures := failures || format('token holder should be viewer, is %s', r); end if;
  checks := checks + 1;
  select count(*) into n from public.trips where id = trip_a;
  if n <> 1 then failures := failures || 'viewer cannot read the trip'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.reminders where trip_id = trip_a;
  if n < 1 then failures := failures || 'viewer cannot read child rows'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.trip_members where trip_id = trip_a;
  if n <> 1 then failures := failures || format('viewer should see only their own member row, saw %s', n); end if;

  -- every write fails for a viewer
  foreach t in array child_tables loop
    checks := checks + 1;
    execute format('update public.%I set trip_id = trip_id where trip_id = %L', t, trip_a);
    get diagnostics rc = row_count;
    if rc <> 0 then failures := failures || format('viewer updated rows in %s', t); end if;
    checks := checks + 1;
    execute format('delete from public.%I where trip_id = %L', t, trip_a);
    get diagnostics rc = row_count;
    if rc <> 0 then failures := failures || format('viewer deleted rows in %s', t); end if;
  end loop;
  checks := checks + 1;
  begin insert into public.travelers (trip_id, name) values (trip_a, 'nope'); failures := failures || 'viewer inserted a traveler'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin insert into public.expenses (trip_id, spent_on, description, amount) values (trip_a, current_date, 'x', 1);
    failures := failures || 'viewer inserted an expense'::text;
  exception when insufficient_privilege or not_null_violation or undefined_column then null; end;
  checks := checks + 1;
  update public.trips set name = 'hacked' where id = trip_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer renamed the trip'::text; end if;
  checks := checks + 1;
  begin update public.trip_members set role = 'owner' where trip_id = trip_a; failures := failures || 'viewer edited trip_members'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.regenerate_invite(trip_a); failures := failures || 'viewer replaced the invite link'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.revoke_viewer(trip_a, viewer_u); failures := failures || 'viewer revoked someone'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.save_onboarding(trip_a, 1, '{"name":"x"}'::jsonb); failures := failures || 'viewer ran save_onboarding'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.finish_onboarding(trip_a, false); failures := failures || 'viewer ran finish_onboarding'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin perform public.start_new_trip(); failures := failures || 'viewer started a new trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select public.is_admin() into ok;
  if ok then failures := failures || 'anonymous viewer is admin'::text; end if;
  reset role;

  -- owner joining their own link keeps the owner role
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  perform public.join_trip(tok);
  checks := checks + 1;
  select public.trip_role(trip_a) into r;
  if r is distinct from 'owner' then failures := failures || 'join_trip changed the owner role'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.trip_members where trip_id = trip_a;
  if n <> 2 then failures := failures || format('owner should see both members, saw %s', n); end if;
  reset role;

  -- ============================== LEGACY SESSION (pre-revision editor) ==============================
  perform set_config('request.jwt.claims', c_legacy, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.travelers where trip_id = trip_old;
  if n <> 1 then failures := failures || 'legacy member lost read access'::text; end if;
  checks := checks + 1;
  update public.travelers set name = 'legacy edit' where trip_id = trip_old;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'legacy member can still write'::text; end if;
  checks := checks + 1;
  begin insert into public.travelers (trip_id, name) values (trip_old, 'legacy insert'); failures := failures || 'legacy member can still insert'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  -- ============================== NON-ADMIN GOOGLE USER ==============================
  perform set_config('request.jwt.claims', c_other, true);
  set local role authenticated;
  checks := checks + 1;
  select public.is_admin() into ok;
  if ok then failures := failures || 'non-admin google user is admin'::text; end if;
  checks := checks + 1;
  begin perform public.create_trip('x'); failures := failures || 'non-admin created a trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select count(*) into n from public.trips;
  if n <> 0 then failures := failures || 'non-admin google user sees trips without an invite'::text; end if;
  reset role;

  -- ============================== ADMIN EMAIL ON AN ANONYMOUS SESSION ==============================
  perform set_config('request.jwt.claims', c_fake, true);
  set local role authenticated;
  checks := checks + 1;
  select public.is_admin() into ok;
  if ok then failures := failures || 'anonymous session with an admin email passed is_admin'::text; end if;
  checks := checks + 1;
  begin perform public.create_trip('x'); failures := failures || 'fake admin created a trip'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  -- ============================== REVOKE AND REPLACE LINK ==============================
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  perform public.revoke_viewer(trip_a, viewer_u);
  reset role;

  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.trips where id = trip_a;
  if n <> 0 then failures := failures || 'revoked viewer still reads the trip'::text; end if;
  checks := checks + 1;
  begin perform public.join_trip(tok); failures := failures || 'revoked viewer rejoined with the same link'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  tok2 := public.regenerate_invite(trip_a);
  reset role;
  checks := checks + 1;
  if tok2 = tok then failures := failures || 'regenerate_invite kept the same token'::text; end if;

  perform set_config('request.jwt.claims', c_stranger, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.join_trip(tok); failures := failures || 'old link still joins'::text;
  exception when sqlstate 'P0002' then null; end;
  perform public.join_trip(tok2);
  checks := checks + 1;
  select count(*) into n from public.trips where id = trip_a;
  if n <> 1 then failures := failures || 'new link did not grant view access'::text; end if;
  reset role;

  -- a viewer cut off by the replacement can come back with the NEW link
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  perform public.join_trip(tok2);
  select count(*) into n from public.trips where id = trip_a;
  if n <> 1 then failures := failures || 'viewer cut off by replacement could not rejoin with the new link'::text; end if;
  reset role;

  -- ============================== DRAFTS, VOTES, COMMENTS (migration 9) ==============================
  -- Owner sets the scene: a draft on trip_a, and an unrelated item on the owner's other trip.
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  insert into public.attractions (trip_id, name) values (trip_a, 'Draft sight') returning id into item_a;
  insert into public.food_places (trip_id, name) values (trip_a, 'Draft food') returning id into item_f;
  insert into public.attractions (trip_id, name) values (trip_old, 'Other trip sight') returning id into item_old;
  checks := checks + 1;
  select decision into r from public.attractions where id = item_a;
  if r is distinct from 'draft' then failures := failures || format('new items should default to draft, got %s', r); end if;

  -- details + deal_breaker (migration 15): the owner writes them; the database keeps details a small JSON object
  update public.attractions set details = '{"type":"nature","entranceFee":0}'::jsonb, deal_breaker = true where id = item_a;
  checks := checks + 1;
  select details->>'type' into r from public.attractions where id = item_a;
  if r is distinct from 'nature' then failures := failures || 'owner could not save details'::text; end if;
  checks := checks + 1;
  select deal_breaker into ok from public.attractions where id = item_a;
  if ok is not true then failures := failures || 'owner could not set the deal-breaker flag'::text; end if;
  checks := checks + 1;
  begin
    update public.attractions set details = '[1]'::jsonb where id = item_a;
    failures := failures || 'details accepted a JSON array'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    update public.attractions set details = jsonb_build_object('blob', repeat('x', 9000)) where id = item_a;
    failures := failures || 'details accepted an oversized value'::text;
  exception when check_violation then null; end;

  -- order and connectors (migration 16): the owner adds a commute; kind and details are guarded by the database
  insert into public.itinerary_items (trip_id, activity, kind, day, position, duration_min, details)
    values (trip_a, 'Walk', 'commute', 1, 1500, 12, '{"mode":"walk"}'::jsonb) returning id into conn_id;
  checks := checks + 1;
  select kind into r from public.itinerary_items where id = conn_id;
  if r is distinct from 'commute' then failures := failures || 'owner could not add a commute'::text; end if;
  checks := checks + 1;
  begin
    update public.itinerary_items set kind = 'nonsense' where id = conn_id;
    failures := failures || 'kind accepted an unknown value'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    update public.itinerary_items set details = '[1]'::jsonb where id = conn_id;
    failures := failures || 'connector details accepted a JSON array'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    update public.itinerary_items set position = 'Infinity'::float8 where id = conn_id;
    failures := failures || 'position accepted infinity'::text;
  exception when check_violation then null; end;

  insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'attractions', item_a, 'in') returning id into vote_o;
  insert into public.comments (trip_id, item_table, item_id, body) values (trip_a, 'attractions', item_a, 'owner comment') returning id into cm_o;

  -- tentative stops: draft -> dashed, confirm -> solid, back to draft -> dashed, drop -> removed
  insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'Draft sight', 'attractions', item_a) returning id into stop_id;
  checks := checks + 1;
  select tentative into ok from public.itinerary_items where id = stop_id;
  if ok is not true then failures := failures || 'a stop from a draft should be tentative'::text; end if;
  update public.attractions set decision = 'confirmed' where id = item_a;
  checks := checks + 1;
  select tentative into ok from public.itinerary_items where id = stop_id;
  if ok is not false then failures := failures || 'confirming the source should make the stop solid'::text; end if;
  update public.attractions set decision = 'draft' where id = item_a;
  checks := checks + 1;
  select tentative into ok from public.itinerary_items where id = stop_id;
  if ok is not true then failures := failures || 'moving the source back to draft should make the stop tentative'::text; end if;
  update public.attractions set decision = 'dropped' where id = item_a;
  checks := checks + 1;
  select count(*) into n from public.itinerary_items where id = stop_id;
  if n <> 0 then failures := failures || 'dropping the source should remove its stop'::text; end if;
  checks := checks + 1;
  begin
    insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'x', 'attractions', item_a);
    failures := failures || 'a dropped idea could be added to the itinerary'::text;
  exception when check_violation then null; end;
  update public.attractions set decision = 'draft' where id = item_a;
  checks := checks + 1;
  begin
    insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'x', 'attractions', item_old);
    failures := failures || 'a stop could point at an idea from another trip'::text;
  exception when foreign_key_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'x', 'expenses', item_a);
    failures := failures || 'a stop could point at a table outside the allowed list'::text;
  exception when check_violation or foreign_key_violation then null; end;
  insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'Draft sight', 'attractions', item_a) returning id into stop_id;
  reset role;

  -- ---- viewer (a member of trip_a through the link) ----
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.attractions where id = item_a;
  if n <> 1 then failures := failures || 'viewer should read drafts'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.votes where trip_id = trip_a;
  if n <> 1 then failures := failures || 'viewer should read everyones votes'::text; end if;

  checks := checks + 1;
  insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'attractions', item_a, 'maybe');
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'viewer could not vote'::text; end if;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, user_id, value) values (trip_a, 'food_places', item_f, owner_u, 'pass');
    failures := failures || 'viewer could vote as someone else'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'attractions', item_a, 'maybe');
    failures := failures || 'viewer could vote twice on the same item'::text;
  exception when unique_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_old, 'attractions', item_old, 'in');
    failures := failures || 'viewer could vote on another trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'attractions', item_old, 'in');
    failures := failures || 'viewer could vote on another trips item by claiming it belongs to trip_a'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'food_places', item_f, 'love');
    failures := failures || 'a vote value outside in/maybe/pass was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'expenses', gen_random_uuid(), 'in');
    failures := failures || 'a vote on a table outside the allowed list was accepted'::text;
  exception when check_violation or insufficient_privilege then null; end;
  checks := checks + 1;
  update public.votes set value = 'pass' where item_id = item_a and user_id = viewer_u;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'viewer could not change their own vote'::text; end if;
  checks := checks + 1;
  update public.votes set value = 'pass' where id = vote_o;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer changed the owners vote'::text; end if;
  checks := checks + 1;
  delete from public.votes where id = vote_o;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer deleted the owners vote'::text; end if;
  checks := checks + 1;
  begin
    update public.votes set user_id = owner_u where item_id = item_a and user_id = viewer_u;
    failures := failures || 'viewer could reassign a vote to someone else'::text;
  exception when insufficient_privilege then null; end;

  checks := checks + 1;
  insert into public.comments (trip_id, item_table, item_id, body) values (trip_a, 'attractions', item_a, 'viewer comment') returning id into cm_v;
  select count(*) into n from public.comments where item_id = item_a;
  if n <> 2 then failures := failures || 'viewer should read all comments on the item'::text; end if;
  checks := checks + 1;
  begin
    insert into public.comments (trip_id, item_table, item_id, user_id, body) values (trip_a, 'attractions', item_a, owner_u, 'forged');
    failures := failures || 'viewer could comment as someone else'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.comments (trip_id, item_table, item_id, body) values (trip_old, 'attractions', item_old, 'other trip');
    failures := failures || 'viewer could comment on another trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.comments (trip_id, item_table, item_id, body) values (trip_a, 'attractions', item_a, '   ');
    failures := failures || 'an empty comment was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  update public.comments set body = 'edited' where id = cm_v;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'viewer could not edit their own comment'::text; end if;
  checks := checks + 1;
  update public.comments set body = 'hacked' where id = cm_o;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer edited the owners comment'::text; end if;
  checks := checks + 1;
  delete from public.comments where id = cm_o;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer deleted the owners comment'::text; end if;

  -- a viewer still cannot edit the plan: decision, items, itinerary
  checks := checks + 1;
  update public.attractions set decision = 'confirmed' where id = item_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer changed a decision'::text; end if;
  checks := checks + 1;
  update public.attractions set details = '{"type":"other"}'::jsonb, deal_breaker = false where id = item_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer changed details or the deal-breaker flag'::text; end if;
  checks := checks + 1;
  select details->>'type' into r from public.attractions where id = item_a;
  if r is distinct from 'nature' then failures := failures || 'viewer could not read details'::text; end if;
  checks := checks + 1;
  update public.itinerary_items set position = 1, kind = 'stop' where id = conn_id;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer moved an item or changed its kind'::text; end if;
  checks := checks + 1;
  select kind into r from public.itinerary_items where id = conn_id;
  if r is distinct from 'commute' then failures := failures || 'viewer could not read a connector'::text; end if;
  checks := checks + 1;
  begin
    insert into public.attractions (trip_id, name) values (trip_a, 'sneaky');
    failures := failures || 'viewer could add an item'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  delete from public.attractions where id = item_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer deleted an item'::text; end if;
  checks := checks + 1;
  update public.itinerary_items set done = true where id = stop_id;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'viewer edited an itinerary stop'::text; end if;
  checks := checks + 1;
  begin
    insert into public.itinerary_items (trip_id, activity, source_table, source_id) values (trip_a, 'sneaky stop', 'attractions', item_a);
    failures := failures || 'viewer could add a tentative stop'::text;
  exception when insufficient_privilege then null; end;

  -- display names: a member can set only their own; names come from trip_people (no emails)
  checks := checks + 1;
  perform public.set_my_label(trip_a, '  Tita Rose ');
  select label into r from public.trip_people(trip_a) where user_id = viewer_u;
  if r is distinct from 'Tita Rose' then failures := failures || format('viewer label should be trimmed and visible, got %s', r); end if;
  checks := checks + 1;
  begin
    perform public.set_my_label(trip_a, '');
    failures := failures || 'an empty name was accepted'::text;
  exception when sqlstate '22023' then null; end;
  checks := checks + 1;
  begin
    perform public.set_my_label(trip_old, 'Intruder');
    failures := failures || 'viewer set a label on a trip they are not in'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select count(*) into n from public.trip_people(trip_old);
  if n <> 0 then failures := failures || 'trip_people leaked another trips members'::text; end if;
  reset role;

  -- ---- a signed-in user who never joined (anonymous, not a member of trip_a) ----
  perform set_config('request.jwt.claims', c_fake, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.votes;
  if n <> 0 then failures := failures || 'a non-member read votes'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.comments;
  if n <> 0 then failures := failures || 'a non-member read comments'::text; end if;
  checks := checks + 1;
  begin
    insert into public.votes (trip_id, item_table, item_id, value) values (trip_a, 'attractions', item_a, 'in');
    failures := failures || 'a non-member could vote'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.comments (trip_id, item_table, item_id, body) values (trip_a, 'attractions', item_a, 'hi');
    failures := failures || 'a non-member could comment'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select count(*) into n from public.trip_people(trip_a);
  if n <> 0 then failures := failures || 'a non-member listed the trips people'::text; end if;
  reset role;

  -- ============================== PLACES (migration 10) ==============================
  -- The owner links a draft to a Google place (place ID and coordinates; never Google content).
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  insert into public.place_refs (trip_id, item_table, item_id, place_id, lat, lng, coords_at)
  values (trip_a, 'attractions', item_a, 'ChIJ-abcdefghij', 21.03, 105.85, now())
  returning id into ref_id;
  if ref_id is null then failures := failures || 'owner could not link a draft to a place'::text; end if;

  -- one link per idea
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id) values (trip_a, 'attractions', item_a, 'ChIJ-second-one');
    failures := failures || 'an idea got two place links'::text;
  exception when unique_violation then null; end;
  -- an idea from another trip cannot be linked to this trip
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id) values (trip_old, 'attractions', item_a, 'ChIJ-abcdefghij');
    failures := failures || 'linked a place to an idea of another trip'::text;
  exception when insufficient_privilege then null; end;
  -- only the three idea tables
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id) values (trip_a, 'expenses', item_a, 'ChIJ-abcdefghij');
    failures := failures || 'place_refs accepted a table that is not an idea table'::text;
  exception when check_violation or insufficient_privilege then null; end;
  -- a malformed place id and half a coordinate
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id) values (trip_a, 'food_places', item_f, 'bad id/with?stuff');
    failures := failures || 'a malformed place id was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id, lat) values (trip_a, 'food_places', item_f, 'ChIJ-abcdefghij', 21.0);
    failures := failures || 'half a coordinate was accepted'::text;
  exception when check_violation then null; end;
  -- the link cannot be moved to another idea or trip
  checks := checks + 1;
  begin
    update public.place_refs set item_id = item_f where id = ref_id;
    failures := failures || 'a place link was moved to another idea'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    update public.place_refs set trip_id = trip_old where id = ref_id;
    failures := failures || 'a place link was moved to another trip'::text;
  exception when insufficient_privilege then null; end;

  -- 30-day coordinate limit: stale coordinates are deleted, fresh ones and the place id are kept
  reset role;
  update public.place_refs set coords_at = now() - interval '40 days' where id = ref_id;
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  select public.purge_stale_place_coords() into n;
  if n <> 1 then failures := failures || format('purge should clear 1 stale coordinate, cleared %s', n); end if;
  checks := checks + 1;
  select (lat is null and lng is null and coords_at is null and place_id = 'ChIJ-abcdefghij') into ok from public.place_refs where id = ref_id;
  if not coalesce(ok, false) then failures := failures || 'purge should clear coordinates but keep the place id'::text; end if;
  checks := checks + 1;
  update public.place_refs set lat = 21.03, lng = 105.85, coords_at = now() where id = ref_id;
  select public.purge_stale_place_coords() into n;
  if n <> 0 then failures := failures || 'purge cleared fresh coordinates'::text; end if;

  -- quota guard, as the owner (the meter may already hold calls from real use, so compare against the starting count)
  select coalesce(max(calls), 0) into i from public.api_usage where sku = 'photos' and period = date_trunc('month', now() at time zone 'utc')::date;
  checks := checks + 1;
  select public.reserve_api_call('photos') into r;
  if r is distinct from 'ok' then failures := failures || format('owner reserve should be ok, got %s', r); end if;
  checks := checks + 1;
  select calls into n from public.api_usage where sku = 'photos';
  if n is distinct from i + 1 then failures := failures || format('usage should be %s, got %s', i + 1, n); end if;
  checks := checks + 1;
  select public.reserve_api_call('not_a_sku') into r;
  if r is distinct from 'cap' then failures := failures || format('an unknown sku must fail closed, got %s', r); end if;
  checks := checks + 1;
  select public.reserve_api_call('text_search_atmosphere') into r;
  if r is distinct from 'ok' then failures := failures || format('the description search sku should reserve ok, got %s', r); end if;
  checks := checks + 1;
  select monthly_cap into n from public.api_caps where sku = 'text_search_atmosphere';
  if n is distinct from 800 then failures := failures || format('the description search cap should be 800, got %s', n); end if;
  -- nobody can write the quota tables directly (that would let a client reset its own meter)
  checks := checks + 1;
  begin
    update public.api_usage set calls = 0;
    get diagnostics rc = row_count;
    if rc <> 0 then failures := failures || 'owner reset the usage meter'::text; end if;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into public.api_caps (sku, monthly_cap, free_allowance) values ('free_lunch', 1, 1000000);
    failures := failures || 'owner added a quota sku'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    update public.api_caps set monthly_cap = 800 where sku = 'photos';
    get diagnostics rc = row_count;
    if rc <> 0 then failures := failures || 'owner raised a cap'::text; end if;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    perform 1 from public.place_fetch_log;
    failures := failures || 'owner read the internal fetch log'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  -- the monthly cap holds (here a tiny cap for one sku, set as the table owner), and then the rate limit
  delete from public.api_usage where sku in ('details_enterprise', 'details_pro'); -- start these two from zero (rolled back with everything else)
  delete from public.place_fetch_log;
  update public.api_caps set monthly_cap = 3, free_allowance = 3 where sku = 'details_enterprise';
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  select string_agg(public.reserve_api_call('details_enterprise'), ',') into r from generate_series(1, 5);
  if r is distinct from 'ok,ok,ok,cap,cap' then failures := failures || format('cap of 3 should give ok,ok,ok,cap,cap, got %s', r); end if;
  checks := checks + 1;
  select calls into n from public.api_usage where sku = 'details_enterprise';
  if n <> 3 then failures := failures || format('a refused call must not count: usage %s', n); end if;
  reset role;
  delete from public.place_fetch_log;
  checks := checks + 1;
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  select string_agg(public.reserve_api_call('details_pro'), ',' order by g) into r from generate_series(1, 32) g;
  if r not like '%,ok,rate,rate' or (length(r) - length(replace(r, 'ok', ''))) / 2 <> 30 then failures := failures || format('rate limit should allow 30 calls a minute, got %s', r); end if;
  reset role;

  -- viewer (still active here): reads the links (for the photo and the Maps link), writes nothing, no quota
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.place_refs where trip_id = trip_a;
  if n <> 1 then failures := failures || format('a viewer should see the 1 place link, saw %s', n); end if;
  checks := checks + 1;
  begin
    insert into public.place_refs (trip_id, item_table, item_id, place_id) values (trip_a, 'food_places', item_f, 'ChIJ-viewer-link');
    failures := failures || 'a viewer linked a place'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  update public.place_refs set place_id = 'ChIJ-viewer-edit' where id = ref_id;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer edited a place link'::text; end if;
  checks := checks + 1;
  delete from public.place_refs where id = ref_id;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer deleted a place link'::text; end if;
  checks := checks + 1;
  begin perform public.reserve_api_call('photos'); failures := failures || 'a viewer reserved a Google call'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select count(*) into n from public.api_usage;
  if n <> 0 then failures := failures || 'a viewer reads the usage meter'::text; end if;
  reset role;

  -- a member of another trip, a signed-in Google user who is not the owner, and an anonymous session wearing the admin email
  for t in select unnest(array['legacy', 'other', 'fake']) loop
    perform set_config('request.jwt.claims', case t when 'legacy' then c_legacy when 'other' then c_other else c_fake end, true);
    set local role authenticated;
    checks := checks + 1;
    select count(*) into n from public.place_refs where trip_id = trip_a;
    if n <> 0 then failures := failures || format('%s reads place links of a trip they are not in', t); end if;
    checks := checks + 1;
    begin perform public.reserve_api_call('photos'); failures := failures || format('%s reserved a Google call', t);
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;

  -- no session at all: the anon role has no access to the quota function or the place links
  checks := checks + 1;
  if has_function_privilege('anon', 'public.reserve_api_call(text)', 'execute') then failures := failures || 'anon can run reserve_api_call'::text; end if;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.place_refs', 'select') or has_table_privilege('anon', 'public.api_usage', 'select') then failures := failures || 'anon can read place links or usage'::text; end if;

  -- ============================== PICTURES (migration 11) ==============================
  -- The owner adds photos to a draft: an upload, a pasted link and a Wikimedia picture.
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  insert into public.item_images (trip_id, item_table, item_id, source, storage_path, position)
  values (trip_a, 'attractions', item_a, 'upload', trip_a::text || '/' || gen_random_uuid()::text || '.jpg', 0);
  insert into public.item_images (trip_id, item_table, item_id, source, url, page_url, credit, position)
  values (trip_a, 'attractions', item_a, 'link', 'https://cdn.example.com/room.jpg', 'https://www.example.com/hotel', 'example.com', 1);
  insert into public.item_images (trip_id, item_table, item_id, source, url, page_url, credit, license, position)
  values (trip_a, 'attractions', item_a, 'wikimedia', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/640px-x.jpg',
          'https://commons.wikimedia.org/wiki/File:x.jpg', 'A. Author', 'CC BY-SA 4.0', 2);
  select count(*) into n from public.item_images where item_id = item_a;
  if n <> 3 then failures := failures || format('owner should have added 3 photos, found %s', n); end if;

  -- activity photos (migration 17): the owner can add one to an itinerary activity; an unknown table is refused
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'itinerary_items', gen_random_uuid(), 'link', 'https://cdn.example.com/act.jpg');
    delete from public.item_images where item_table = 'itinerary_items';
  exception when check_violation then failures := failures || 'an activity photo was refused'::text; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'expenses', gen_random_uuid(), 'link', 'https://cdn.example.com/x.jpg');
    failures := failures || 'a photo on an unknown table was accepted'::text;
  exception when check_violation then null; end;

  -- the shape of each kind is enforced by the database
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, storage_path)
    values (trip_a, 'attractions', item_a, 'upload', gen_random_uuid()::text || '/' || gen_random_uuid()::text || '.jpg');
    failures := failures || 'an upload pointing at another trips folder was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, storage_path)
    values (trip_a, 'attractions', item_a, 'upload', trip_a::text || '/../x.jpg');
    failures := failures || 'an upload path with .. was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'attractions', item_a, 'link', 'http://cdn.example.com/room.jpg');
    failures := failures || 'a plain http picture link was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'attractions', item_a, 'link', 'javascript:alert(1)');
    failures := failures || 'a javascript: picture link was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url, storage_path)
    values (trip_a, 'attractions', item_a, 'link', 'https://cdn.example.com/a.jpg', trip_a::text || '/' || gen_random_uuid()::text || '.jpg');
    failures := failures || 'a link that also has a file was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url, page_url)
    values (trip_a, 'attractions', item_a, 'wikimedia', 'https://evil.example/x.jpg', 'https://commons.wikimedia.org/wiki/File:x.jpg');
    failures := failures || 'a wikimedia picture from another host was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url)
    values (trip_a, 'attractions', item_a, 'wikimedia', 'https://upload.wikimedia.org/x.jpg');
    failures := failures || 'a wikimedia picture without its credit page was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'attractions', item_a, 'scraped', 'https://cdn.example.com/a.jpg');
    failures := failures || 'an unknown photo source was accepted'::text;
  exception when check_violation then null; end;
  -- another trip's idea cannot get a photo here
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_old, 'attractions', item_a, 'link', 'https://cdn.example.com/a.jpg');
    failures := failures || 'a photo was added to an idea of another trip'::text;
  exception when insufficient_privilege then null; end;
  -- only the order and the credit can change afterwards
  checks := checks + 1;
  update public.item_images set position = 5, credit = 'edited' where item_id = item_a and source = 'link';
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not reorder a photo'::text; end if;
  checks := checks + 1;
  begin
    update public.item_images set url = 'https://evil.example/x.jpg' where item_id = item_a and source = 'link';
    failures := failures || 'a photo address was changed after the fact'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    update public.item_images set item_id = item_f where item_id = item_a;
    failures := failures || 'a photo was moved to another idea'::text;
  exception when insufficient_privilege then null; end;
  -- at most 12 photos per idea
  checks := checks + 1;
  for i in 1..9 loop
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'attractions', item_a, 'link', 'https://cdn.example.com/' || i || '.jpg');
  end loop;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'attractions', item_a, 'link', 'https://cdn.example.com/13.jpg');
    failures := failures || 'a 13th photo was accepted'::text;
  exception when check_violation then null; end;

  -- Storage: the owner writes inside this trips folder only, and only while there is room
  checks := checks + 1;
  insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', trip_a::text || '/' || gen_random_uuid()::text || '.jpg', '{"size": 200000}');
  select count(*) into n from storage.objects where bucket_id = 'trip-photos';
  if n <> 1 then failures := failures || format('owner should see the 1 uploaded file, saw %s', n); end if;
  checks := checks + 1;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', gen_random_uuid()::text || '/' || gen_random_uuid()::text || '.jpg', '{"size": 1}');
    failures := failures || 'owner uploaded into a trip folder they do not edit'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', 'loose.jpg', '{"size": 1}');
    failures := failures || 'a file outside any trip folder was accepted'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', trip_a::text || '/' || gen_random_uuid()::text || '.html', '{"size": 1}');
    failures := failures || 'a non-image file name was accepted'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  select used, cap into n, rc from public.photo_storage_status();
  if n <> 200000 or rc <> 900 * 1024 * 1024 then failures := failures || format('storage status should be 200000 of 943718400, got %s of %s', n, rc); end if;
  reset role;

  -- the hard cap: once the bucket is at 900 MB, no more uploads
  insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', trip_a::text || '/' || gen_random_uuid()::text || '.jpg', '{"size": 950000000}');
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', trip_a::text || '/' || gen_random_uuid()::text || '.jpg', '{"size": 100}');
    failures := failures || 'an upload was accepted past the storage cap'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  -- real Supabase refuses direct deletes from storage tables unless this switch is on (a test-only switch, rolled back)
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'trip-photos' and (metadata ->> 'size')::bigint = 950000000;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not delete a file to free space'::text; end if;
  reset role;

  -- viewer (still active): sees the photos and the files, changes nothing, cannot read the storage meter
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.item_images where item_id = item_a;
  if n <> 12 then failures := failures || format('a viewer should see the 12 photos, saw %s', n); end if;
  checks := checks + 1;
  select count(*) into n from storage.objects where bucket_id = 'trip-photos';
  if n <> 1 then failures := failures || format('a viewer should see the 1 file, saw %s', n); end if;
  checks := checks + 1;
  begin
    insert into public.item_images (trip_id, item_table, item_id, source, url) values (trip_a, 'food_places', item_f, 'link', 'https://cdn.example.com/v.jpg');
    failures := failures || 'a viewer added a photo'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  update public.item_images set position = 9 where item_id = item_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer reordered photos'::text; end if;
  checks := checks + 1;
  delete from public.item_images where item_id = item_a;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer deleted photos'::text; end if;
  checks := checks + 1;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('trip-photos', trip_a::text || '/' || gen_random_uuid()::text || '.jpg', '{"size": 1}');
    failures := failures || 'a viewer uploaded a file'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  -- real Supabase refuses direct deletes from storage tables unless this switch is on (a test-only switch, rolled back)
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'trip-photos';
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer deleted a file'::text; end if;
  checks := checks + 1;
  begin perform * from public.photo_storage_status(); failures := failures || 'a viewer read the storage meter'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  -- a member of another trip, a non-admin Google user, and an anonymous session wearing the admin email
  for t in select unnest(array['legacy', 'other', 'fake']) loop
    perform set_config('request.jwt.claims', case t when 'legacy' then c_legacy when 'other' then c_other else c_fake end, true);
    set local role authenticated;
    checks := checks + 1;
    select count(*) into n from public.item_images where trip_id = trip_a;
    if n <> 0 then failures := failures || format('%s reads photos of a trip they are not in', t); end if;
    checks := checks + 1;
    select count(*) into n from storage.objects where bucket_id = 'trip-photos';
    if n <> 0 then failures := failures || format('%s reads files of a trip they are not in', t); end if;
    reset role;
  end loop;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.item_images', 'select') then
    failures := failures || 'anon can touch photos'::text;
  end if;

  -- ============================== EXPENSE LINK (migration 12) ==============================
  -- "Log as expense": an expense points at the flight it paid for; one expense per flight, same trip only.
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  insert into public.flights (trip_id, from_code, to_code, fare, status) values (trip_a, 'MNL', 'HAN', 12000, 'Booked') returning id into flight_id;
  insert into public.flights (trip_id, from_code, to_code, fare, status) values (trip_old, 'MNL', 'HAN', 5000, 'Booked') returning id into flight_old;
  insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table, source_id)
  values (trip_a, 12000, 'PHP', 'Flight MNL to HAN', current_date, 'flights', flight_id);
  select count(*) into n from public.expenses where source_id = flight_id;
  if n <> 1 then failures := failures || 'owner could not log a flight as an expense'::text; end if;
  checks := checks + 1;
  begin
    insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table, source_id)
    values (trip_a, 12000, 'PHP', 'Flight again', current_date, 'flights', flight_id);
    failures := failures || 'a flight was logged as an expense twice'::text;
  exception when unique_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table, source_id)
    values (trip_a, 5000, 'PHP', 'Other trips flight', current_date, 'flights', flight_old);
    failures := failures || 'an expense was linked to a flight of another trip'::text;
  exception when foreign_key_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table, source_id)
    values (trip_a, 1, 'PHP', 'Linked to a transfer', current_date, 'transfers', flight_id);
    failures := failures || 'an expense was linked to a table that is not flights or stays'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table)
    values (trip_a, 1, 'PHP', 'Half a link', current_date, 'flights');
    failures := failures || 'half a link (a table without an id) was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  insert into public.expenses (trip_id, amount, currency, description, spent_on) values (trip_a, 50, 'PHP', 'Plain expense', current_date);
  select count(*) into n from public.expenses where description = 'Plain expense' and source_id is null;
  if n <> 1 then failures := failures || 'a normal expense without a link stopped working'::text; end if;
  reset role;

  -- a viewer cannot log anything
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    insert into public.expenses (trip_id, amount, currency, description, spent_on, source_table, source_id)
    values (trip_a, 1, 'PHP', 'Viewer logs a flight', current_date, 'flights', flight_id);
    failures := failures || 'a viewer logged an expense'::text;
  exception when insufficient_privilege or unique_violation then null; end;
  reset role;

  -- deleting the flight keeps the money that was spent, only the link goes
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  delete from public.flights where id = flight_id;
  select count(*) into n from public.expenses where description = 'Flight MNL to HAN' and source_id is null and source_table is null;
  if n <> 1 then failures := failures || 'deleting a flight lost its expense or left a dangling link'::text; end if;
  reset role;

  -- ============================== BOOKING REFERENCES (migration 13) ==============================
  -- A booking reference can be used to change or cancel a booking: only the owner can read it, even through the API.
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  insert into public.flights (trip_id, from_code, to_code, status, terminal, gate, seat, duration_min)
  values (trip_a, 'HAN', 'MNL', 'Booked', '3', 'B7', '14A', 220) returning id into ref_flight;
  insert into public.flight_refs (flight_id, trip_id, booking_ref) values (ref_flight, trip_a, 'K7QX2P');
  select count(*) into n from public.flight_refs where public.flight_refs.flight_id = ref_flight;
  if n <> 1 then failures := failures || 'owner could not save a booking reference'::text; end if;
  checks := checks + 1;
  select has_ref into ok from public.flights where id = ref_flight;
  if not coalesce(ok, false) then failures := failures || 'flights.has_ref did not follow the booking reference'::text; end if;
  checks := checks + 1;
  begin
    insert into public.flight_refs (flight_id, trip_id, booking_ref) values (ref_flight, trip_a, 'SECOND');
    failures := failures || 'a flight got two booking references'::text;
  exception when unique_violation then null; end;
  checks := checks + 1;
  begin
    insert into public.flight_refs (flight_id, trip_id, booking_ref) values (flight_old, trip_a, 'OTHERTRIP');
    failures := failures || 'a booking reference was saved for a flight of another trip'::text;
  exception when foreign_key_violation then null; end;
  checks := checks + 1;
  begin
    update public.flight_refs set booking_ref = '   ' where public.flight_refs.flight_id = ref_flight;
    failures := failures || 'a blank booking reference was accepted'::text;
  exception when check_violation then null; end;
  checks := checks + 1;
  begin
    update public.flight_refs set trip_id = trip_old where public.flight_refs.flight_id = ref_flight;
    failures := failures || 'a booking reference was moved to another trip'::text;
  exception when insufficient_privilege then null; end;
  checks := checks + 1;
  update public.flight_refs set booking_ref = 'K7QX2Q' where public.flight_refs.flight_id = ref_flight;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not change a booking reference'::text; end if;
  checks := checks + 1;
  begin
    update public.flights set gate = 'TOOLONGGATE1' where id = ref_flight;
    failures := failures || 'a gate longer than 10 characters was accepted'::text;
  exception when check_violation then null; end;
  -- time zones (migration 18): the owner can set a flight's zones and the trip's home zone; an absurd zone id is refused
  checks := checks + 1;
  update public.flights set dep_tz = 'Asia/Manila', arr_tz = 'Asia/Tokyo' where id = ref_flight;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not set a flight time zone'::text; end if;
  checks := checks + 1;
  update public.trips set timezone = 'Asia/Tokyo' where id = trip_a;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not set the trip time zone'::text; end if;
  update public.trips set timezone = 'Asia/Manila' where id = trip_a;
  checks := checks + 1;
  begin
    update public.flights set dep_tz = repeat('x', 65) where id = ref_flight;
    failures := failures || 'a time zone id longer than 64 characters was accepted'::text;
  exception when check_violation then null; end;
  reset role;

  -- a viewer sees that a reference exists (the flag) but never the reference itself, and can change nothing
  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.flight_refs;
  if n <> 0 then failures := failures || 'a viewer can read booking references'::text; end if;
  checks := checks + 1;
  select has_ref into ok from public.flights where id = ref_flight;
  if not coalesce(ok, false) then failures := failures || 'a viewer cannot see that a booking reference exists'::text; end if;
  checks := checks + 1;
  begin
    insert into public.flight_refs (flight_id, trip_id, booking_ref) values (ref_flight, trip_a, 'VIEWER');
    failures := failures || 'a viewer saved a booking reference'::text;
  exception when insufficient_privilege or unique_violation then null; end;
  checks := checks + 1;
  update public.flight_refs set booking_ref = 'HACKED' where public.flight_refs.flight_id = ref_flight;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer changed a booking reference'::text; end if;
  checks := checks + 1;
  delete from public.flight_refs where public.flight_refs.flight_id = ref_flight;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'a viewer deleted a booking reference'::text; end if;
  reset role;

  -- members of other trips, a non-admin Google user, and an anonymous session wearing the admin email
  for t in select unnest(array['legacy', 'other', 'fake']) loop
    perform set_config('request.jwt.claims', case t when 'legacy' then c_legacy when 'other' then c_other else c_fake end, true);
    set local role authenticated;
    checks := checks + 1;
    select count(*) into n from public.flight_refs;
    if n <> 0 then failures := failures || format('%s reads booking references of a trip they are not in', t); end if;
    reset role;
  end loop;
  checks := checks + 1;
  if has_table_privilege('anon', 'public.flight_refs', 'select') then failures := failures || 'anon can read booking references'::text; end if;

  -- removing the reference clears the flag; deleting the flight removes its reference
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  delete from public.flight_refs where public.flight_refs.flight_id = ref_flight;
  select has_ref into ok from public.flights where id = ref_flight;
  if coalesce(ok, true) then failures := failures || 'flights.has_ref stayed true after the reference was removed'::text; end if;
  insert into public.flight_refs (flight_id, trip_id, booking_ref) values (ref_flight, trip_a, 'AGAIN1');
  delete from public.flights where id = ref_flight;
  checks := checks + 1;
  select count(*) into n from public.flight_refs where public.flight_refs.flight_id = ref_flight;
  if n <> 0 then failures := failures || 'deleting a flight left its booking reference behind'::text; end if;
  reset role;

  -- ---- owner moderates: deletes the viewer's comment, cannot edit it; revoked viewers lose everything ----
  perform set_config('request.jwt.claims', c_owner, true);
  set local role authenticated;
  checks := checks + 1;
  update public.comments set body = 'owner rewrote it' where id = cm_v;
  get diagnostics rc = row_count;
  if rc <> 0 then failures := failures || 'owner edited someone elses comment'::text; end if;
  checks := checks + 1;
  delete from public.comments where id = cm_v;
  get diagnostics rc = row_count;
  if rc <> 1 then failures := failures || 'owner could not delete a viewers comment'::text; end if;
  perform public.revoke_viewer(trip_a, viewer_u);
  reset role;

  perform set_config('request.jwt.claims', c_viewer, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.votes;
  if n <> 0 then failures := failures || 'a revoked viewer still reads votes'::text; end if;
  checks := checks + 1;
  begin
    insert into public.comments (trip_id, item_table, item_id, body) values (trip_a, 'attractions', item_a, 'still here?');
    failures := failures || 'a revoked viewer could comment'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  -- deleting an idea cleans up its votes, comments and stops (as the table owner here)
  delete from public.attractions where id = item_a;
  checks := checks + 1;
  select (select count(*) from public.votes where item_id = item_a) + (select count(*) from public.comments where item_id = item_a)
       + (select count(*) from public.itinerary_items where source_id = item_a) into n;
  if n <> 0 then failures := failures || 'deleting an idea left votes, comments or stops behind'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.place_refs where item_id = item_a;
  if n <> 0 then failures := failures || 'deleting an idea left its place link behind'::text; end if;
  checks := checks + 1;
  select count(*) into n from public.item_images where item_id = item_a;
  if n <> 0 then failures := failures || 'deleting an idea left its photos behind'::text; end if;

  -- ============================== anonymous role (no session) ==============================
  checks := checks + 1;
  set local role anon;
  begin
    perform 1 from public.trips;
    failures := failures || 'anon role can read trips'::text;
  exception when insufficient_privilege then null; end;
  reset role;

  if array_length(failures, 1) is null then
    raise exception 'RLS CHECK PASSED (% checks)', checks;
  else
    raise exception 'RLS CHECK FAILED: %', array_to_string(failures, '; ');
  end if;
end $$;
