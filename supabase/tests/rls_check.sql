-- RLS proof. Paste into Supabase → SQL Editor and run.
-- It creates two throwaway users, runs every check as each user, then ALWAYS
-- rolls back by raising an exception at the end. Read the final message:
--   "RLS CHECK PASSED (n checks)"  or  "RLS CHECK FAILED: ..."

do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  trip_a uuid;
  token_a text;
  n int;
  failures text[] := '{}';
  checks int := 0;
  t text;
  child_tables text[] := array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'];
begin
  insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
  values (user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
         (user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

  -- ---------------- User A creates a trip with some data ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  trip_a := public.create_trip('A''s trip');
  select join_token into token_a from public.trips where id = trip_a;
  insert into public.travelers (trip_id, name) values (trip_a, 'Aq');
  insert into public.reminders (trip_id, text) values (trip_a, 'secret reminder');

  checks := checks + 1;
  select count(*) into n from public.categories where trip_id = trip_a;
  if n <> 8 then failures := failures || format('A should see 8 default categories, saw %s', n); end if;

  checks := checks + 1;
  begin
    insert into public.trips (name) values ('direct insert');
    failures := failures || 'A could insert into trips directly'::text;
  exception when insufficient_privilege then null;
  end;

  reset role;

  -- ---------------- User B never got the link ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  checks := checks + 1;
  select count(*) into n from public.trips where id = trip_a;
  if n <> 0 then failures := failures || 'B can read A''s trip'::text; end if;

  checks := checks + 1;
  select count(*) into n from public.trip_members where trip_id = trip_a;
  if n <> 0 then failures := failures || 'B can read A''s members'::text; end if;

  checks := checks + 1;
  if (select count(*) from public.active_trip()) <> 0 then failures := failures || 'B has an active trip'::text; end if;

  foreach t in array child_tables loop
    checks := checks + 1;
    execute format('select count(*) from public.%I where trip_id = $1', t) into n using trip_a;
    if n <> 0 then failures := failures || format('B can read A''s %s', t); end if;
  end loop;

  checks := checks + 1;
  begin
    insert into public.travelers (trip_id, name) values (trip_a, 'intruder');
    failures := failures || 'B could insert into A''s travelers'::text;
  exception when insufficient_privilege then null;  -- RLS violation is 42501
  end;

  checks := checks + 1;
  update public.trips set name = 'hacked' where id = trip_a;
  get diagnostics n = row_count;
  if n <> 0 then failures := failures || 'B could update A''s trip'::text; end if;

  checks := checks + 1;
  delete from public.reminders where trip_id = trip_a;
  get diagnostics n = row_count;
  if n <> 0 then failures := failures || 'B could delete A''s reminders'::text; end if;

  checks := checks + 1;
  begin
    perform public.regenerate_join_token(trip_a);
    failures := failures || 'B could regenerate A''s token'::text;
  exception when insufficient_privilege then null;
  end;

  checks := checks + 1;
  begin
    perform public.join_trip('not-the-token');
    failures := failures || 'B joined with a wrong token'::text;
  exception when no_data_found then null;
  end;

  -- ---------------- B opens the invite link ----------------
  checks := checks + 1;
  if public.join_trip(token_a) <> trip_a then failures := failures || 'join_trip returned wrong id'::text; end if;
  perform public.join_trip(token_a);  -- idempotent

  checks := checks + 1;
  select count(*) into n from public.reminders where trip_id = trip_a;
  if n <> 1 then failures := failures || 'B cannot read reminders after joining'::text; end if;

  checks := checks + 1;
  if (select id from public.active_trip()) is distinct from trip_a then
    failures := failures || 'active_trip is not A''s trip after joining'::text;
  end if;

  reset role;

  -- ---------------- Unauthenticated (anon role, no session) ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  checks := checks + 1;
  begin
    select count(*) into n from public.trips;
    failures := failures || 'anon role can query trips'::text;
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;
  begin
    perform public.join_trip(token_a);
    failures := failures || 'anon role can call join_trip'::text;
  exception when insufficient_privilege then null;
  end;
  reset role;

  if array_length(failures, 1) is null then
    raise exception 'RLS CHECK PASSED (% checks). Rolled back, nothing was saved.', checks;
  else
    raise exception 'RLS CHECK FAILED: %', array_to_string(failures, ' | ');
  end if;
end $$;
