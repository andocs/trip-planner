-- Rollback for 20261201000031_stays_into_hotel_ideas.sql.
-- Rebuilds the `stays` table FROM the hotel ideas (so edits made after the merge are kept), points expenses back at it, and
-- removes the booking columns. Stays that were merged into an idea get that idea's id as their id (and details.ideaId).
-- NOTE: ideas the merge created for stays that had no idea (or a second stay on one idea) stay behind as confirmed ideas.
-- Take a backup first.

do $$
begin
  if to_regclass('public.stays_retired') is not null and to_regclass('public.stays') is null then
    alter table public.stays_retired rename to stays;
  end if;
end $$;

-- rebuild the stays from the ideas that are booked
delete from public.stays;
insert into public.stays (id, trip_id, status, city, hotel, room, check_in, check_out, total, confirmation, note, details, created_at)
select h.id, h.trip_id, h.stay_status, h.city, h.hotel, nullif(h.details ->> 'rooms', ''), h.check_in, h.check_out, h.total,
       h.confirmation, h.room,
       jsonb_strip_nulls(jsonb_build_object(
         'cancellation', h.details -> 'cancellation', 'freeUntil', h.details -> 'freeUntil',
         'checkInTime', h.details -> 'checkInTime', 'breakfast', h.details -> 'breakfast',
         'website', h.details -> 'website', 'mapsUrl', h.details -> 'mapsUrl', 'ideaId', to_jsonb(h.id::text))),
       h.created_at
  from public.hotel_ideas h
 where h.is_stay;

-- expenses logged from a stay point at the stays table again (a stay's id is its idea's id)
alter table public.expenses drop constraint if exists expenses_source_table_check;
drop trigger if exists expenses_source_guard on public.expenses;
update public.expenses set source_table = 'stays' where source_table = 'hotel_ideas';
alter table public.expenses add constraint expenses_source_table_check check (source_table in ('flights', 'stays'));

create or replace function public._expense_source_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  if new.source_id is null then
    return new;
  end if;
  if new.source_table is null or new.source_table not in ('flights', 'stays') then
    raise exception 'An expense can only be linked to a flight or a stay' using errcode = '23514';
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and trip_id = $2)', new.source_table)
    into ok using new.source_id, new.trip_id;
  if not coalesce(ok, false) then
    raise exception 'The linked flight or stay is not part of this trip' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger expenses_source_guard before insert or update of source_table, source_id, trip_id on public.expenses
  for each row execute function public._expense_source_guard();

drop trigger if exists hotel_ideas_expense_source_gone on public.hotel_ideas;

-- the table is reachable again
grant select, insert, update, delete on public.stays to authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stays') then
    alter publication supabase_realtime add table public.stays;
  end if;
end $$;
comment on table public.stays is null;

-- the share link reads stays from the stays table again
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

-- finally the booking columns go (the data now lives in stays again)
drop index if exists public.hotel_ideas_stay_idx;
alter table public.hotel_ideas drop constraint if exists hotel_ideas_stay_status_ok;
alter table public.hotel_ideas drop constraint if exists hotel_ideas_stay_dates_ok;
alter table public.hotel_ideas
  drop column if exists is_stay, drop column if exists check_in, drop column if exists check_out,
  drop column if exists stay_status, drop column if exists confirmation;
