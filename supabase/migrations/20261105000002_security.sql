-- Row Level Security and the RPCs that are the only way to create, join or archive trips.

-- ---------------------------------------------------------------------------
-- Grants: the anon role (no session at all) gets nothing. Signed-in users,
-- including anonymous sign-ins, use the `authenticated` role and go through RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- trips: no direct insert/delete; update only the editable columns.
revoke insert, delete, update on public.trips from authenticated;
grant select on public.trips to authenticated;
grant update (name, destination, start_date, end_date, home_currency, foreign_currency, rate, rate_date, budget, map_region)
  on public.trips to authenticated;

-- trip_members: read only; rows are written by the RPCs.
revoke insert, update, delete on public.trip_members from authenticated;
grant select on public.trip_members to authenticated;

-- ---------------------------------------------------------------------------
-- Membership check
-- ---------------------------------------------------------------------------
create or replace function public.is_trip_member(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.trip_members where trip_id = t and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;

create policy trips_select on public.trips for select to authenticated using (public.is_trip_member(id));
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_member(id) and archived_at is null)
  with check (public.is_trip_member(id));

create policy trip_members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

do $$
declare t text;
begin
  foreach t in array array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id))',
      t || '_member_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public._insert_default_categories(p_trip uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (trip_id, name, sort)
  select p_trip, c.name, c.ord::int
  from unnest(array['Flights', 'Accommodation', 'Food & Drinks', 'Transport', 'Activities & Tickets',
                    'Shopping & Pasalubong', 'SIM & Misc', 'Other']) with ordinality as c(name, ord);
$$;

create or replace function public._require_user()
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- The caller's latest non-archived trip (zero or one row).
create or replace function public.active_trip()
returns setof public.trips
language sql
security definer
stable
set search_path = public
as $$
  select t.*
  from public.trips t
  join public.trip_members m on m.trip_id = t.id
  where m.user_id = auth.uid() and t.archived_at is null
  order by m.joined_at desc, t.created_at desc
  limit 1;
$$;

create or replace function public.create_trip(p_name text default 'My Trip')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  new_id uuid;
begin
  insert into public.trips (name) values (coalesce(nullif(trim(p_name), ''), 'My Trip')) returning id into new_id;
  insert into public.trip_members (trip_id, user_id) values (new_id, uid);
  perform public._insert_default_categories(new_id);
  return new_id;
end $$;

-- Joins the trip that owns the token. Safe to call repeatedly.
create or replace function public.join_trip(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  t_id uuid;
begin
  select id into t_id from public.trips where join_token = p_token and archived_at is null;
  if t_id is null then
    raise exception 'Invite link is invalid or has expired' using errcode = 'P0002';
  end if;
  insert into public.trip_members (trip_id, user_id) values (t_id, uid)
  on conflict (trip_id, user_id) do update set joined_at = now();  -- makes it the caller's active trip
  return t_id;
end $$;

-- Archives the caller's active trip and starts a fresh one. Everyone on the old
-- trip moves to the new one, and the invite link (token) moves with them.
create or replace function public.start_new_trip(p_copy_setup boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  old public.trips;
  new_id uuid;
  old_token text;
begin
  select * into old from public.active_trip();

  if old.id is null then
    return public.create_trip();
  end if;

  old_token := old.join_token;
  update public.trips
     set archived_at = now(), join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = old.id;

  insert into public.trips (join_token, home_currency, foreign_currency, rate, map_region)
  values (
    old_token,
    case when p_copy_setup then old.home_currency else 'PHP' end,
    case when p_copy_setup then old.foreign_currency else 'USD' end,
    case when p_copy_setup then old.rate else 1 end,
    case when p_copy_setup then old.map_region else 'world' end)
  returning id into new_id;

  insert into public.trip_members (trip_id, user_id)
  select new_id, m.user_id from public.trip_members m where m.trip_id = old.id;

  perform public._insert_default_categories(new_id);

  if p_copy_setup then
    insert into public.travelers (trip_id, name, sort)
    select new_id, name, sort from public.travelers where trip_id = old.id;
  end if;

  return new_id;
end $$;

-- New invite token for a trip; the old link stops working.
create or replace function public.regenerate_join_token(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
begin
  perform public._require_user();
  if not public.is_trip_member(p_trip) then
    raise exception 'Not a member of this trip' using errcode = '42501';
  end if;
  update public.trips set join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = p_trip and archived_at is null
  returning join_token into tok;
  if tok is null then
    raise exception 'Trip is archived' using errcode = 'P0002';
  end if;
  return tok;
end $$;

-- Only signed-in users may call the RPCs; helpers are internal.
revoke all on function public.is_trip_member(uuid) from public, anon;
revoke all on function public._insert_default_categories(uuid) from public, anon, authenticated;
revoke all on function public._require_user() from public, anon;
revoke all on function public.active_trip() from public, anon;
revoke all on function public.create_trip(text) from public, anon;
revoke all on function public.join_trip(text) from public, anon;
revoke all on function public.start_new_trip(boolean) from public, anon;
revoke all on function public.regenerate_join_token(uuid) from public, anon;

grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public._require_user() to authenticated;
grant execute on function public.active_trip() to authenticated;
grant execute on function public.create_trip(text) to authenticated;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.start_new_trip(boolean) to authenticated;
grant execute on function public.regenerate_join_token(uuid) to authenticated;
