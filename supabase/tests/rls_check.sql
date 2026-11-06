-- RLS proof for the owner / viewer model. Works in the Supabase SQL editor and in local `psql`.
-- It creates throwaway users, runs every check as each user, and ALWAYS rolls back by raising an
-- exception at the end. Read the final message: "RLS CHECK PASSED (n checks)" or "RLS CHECK FAILED: ...".
-- Needs migrations 1..6 applied. Does not need any real admin: it inserts a throwaway admin email.

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
  tok text;
  tok2 text;
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
  if n <> 1 then failures := failures || 'viewer cannot read child rows'::text; end if;
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
