-- #21: a read-only share link for people without an account. Additive. Rollback: supabase/rollback/rollback_000030.sql
--
-- The owner switches a link on; anyone holding it can read a small, fixed slice of the trip without signing in.
-- What the slice contains is decided HERE, in shared_trip(): the trip name, destination, dates and time zone; the
-- itinerary stops (day, time, duration, name, city, type, tentative); flights (airline, number, airports, times, time
-- zones, terminal, status); stays (hotel, city, check-in and check-out). Never: prices, fares, expenses, notes,
-- booking references, confirmation numbers, seats, travelers, comments, packing, ideas, photos or anything else.
--
-- The token is 144 bits and lives in its own owner-only table (not in trips, so it cannot leak through the trip row,
-- active_trip() or Realtime). Replacing the link or stopping sharing makes the old one stop working at once.

create table if not exists public.trip_shares (
  trip_id    uuid primary key references public.trips (id) on delete cascade,
  token      text not null unique check (char_length(token) >= 24),
  created_at timestamptz not null default now()
);

alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from anon, authenticated;
grant select on public.trip_shares to authenticated;
drop policy if exists trip_shares_select on public.trip_shares;
create policy trip_shares_select on public.trip_shares for select to authenticated using (public.is_trip_owner(trip_id));

-- Owner only. Creates the link, or replaces it (the old one stops working). Returns the new token.
create or replace function public.create_trip_share(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare tok text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can share the trip' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trips where id = p_trip and archived_at is null) then
    raise exception 'Trip is archived' using errcode = 'P0002';
  end if;
  insert into public.trip_shares (trip_id, token) values (p_trip, tok)
  on conflict (trip_id) do update set token = excluded.token, created_at = now();
  return tok;
end $$;

-- Owner only. Stops sharing: the link stops working.
create or replace function public.revoke_trip_share(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_user();
  if not public.is_trip_owner(p_trip) then
    raise exception 'Only the trip owner can stop sharing' using errcode = '42501';
  end if;
  delete from public.trip_shares where trip_id = p_trip;
end $$;

-- Anyone holding a valid token (no sign-in). Returns null for an unknown token or an archived trip.
create or replace function public.shared_trip(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare t public.trips;
begin
  if p_token is null or char_length(p_token) < 24 or char_length(p_token) > 128 then return null; end if;
  select tr.* into t
    from public.trips tr
    join public.trip_shares s on s.trip_id = tr.id
   where s.token = p_token and tr.archived_at is null;
  if t.id is null then return null; end if;

  return jsonb_build_object(
    'trip', jsonb_build_object(
      'name', t.name, 'destination', t.destination,
      'start_date', t.start_date, 'end_date', t.end_date, 'timezone', t.timezone),
    'itinerary', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', i.day, 'on_date', i.on_date, 'at_time', i.at_time, 'duration_min', i.duration_min,
               'activity', i.activity, 'city', i.city, 'type', i.type, 'tentative', i.tentative)
             order by coalesce(i.day, 9999), i.position nulls last, i.at_time nulls last, i.created_at)
        from public.itinerary_items i
       where i.trip_id = t.id and i.kind = 'stop'), '[]'::jsonb),
    'flights', coalesce((
      select jsonb_agg(jsonb_build_object(
               'airline', f.airline, 'flight_no', f.flight_no, 'from_code', f.from_code, 'to_code', f.to_code,
               'departs_at', f.departs_at, 'arrives_at', f.arrives_at, 'dep_tz', f.dep_tz, 'arr_tz', f.arr_tz,
               'terminal', f.terminal, 'status', f.status)
             order by f.departs_at nulls last, f.created_at)
        from public.flights f where f.trip_id = t.id), '[]'::jsonb),
    'stays', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hotel', s.hotel, 'city', s.city, 'check_in', s.check_in, 'check_out', s.check_out)
             order by s.check_in nulls last, s.created_at)
        from public.stays s where s.trip_id = t.id), '[]'::jsonb)
  );
end $$;

revoke all on function public.create_trip_share(uuid) from public, anon;
revoke all on function public.revoke_trip_share(uuid) from public, anon;
revoke all on function public.shared_trip(text) from public;
grant execute on function public.create_trip_share(uuid) to authenticated;
grant execute on function public.revoke_trip_share(uuid) to authenticated;
-- The one function an unauthenticated visitor may call: it only answers for a valid token.
grant execute on function public.shared_trip(text) to anon, authenticated;
