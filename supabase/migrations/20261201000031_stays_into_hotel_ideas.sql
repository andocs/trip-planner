-- Merge stays into hotel ideas. DATA MOVE: take a backup first. Rollback: supabase/rollback/rollback_000031.sql
--
-- Until now a booked stay lived in `stays` and always had a hotel idea behind it (details.ideaId), and a sync layer kept the
-- two in step. Now a stay IS a hotel idea that has been booked: `hotel_ideas.is_stay = true`, plus the booking facts.
--
--   stays.status        -> hotel_ideas.stay_status
--   stays.check_in/out  -> hotel_ideas.check_in / check_out   (real dates; the idea's day numbers stay in details)
--   stays.confirmation  -> hotel_ideas.confirmation
--   stays.note          -> hotel_ideas.room      (for ideas, `room` has always held the notes)
--   stays.room          -> details.rooms
--   stays.details       -> merged into details   (ideaId is dropped: there is only one row now)
--   stays.total         -> hotel_ideas.total     (what was booked wins over the idea's estimate)
--
-- A stay with a hotel idea behind it is merged INTO that idea (the idea keeps its id, photos, votes and comments). A stay with
-- no idea behind it (or a second stay pointing at the same idea) becomes a new idea with the STAY'S id. Expenses that were
-- logged from a stay are repointed to the new row. Ideas that were never booked get is_stay = false and are untouched.
--
-- The old table is NOT dropped: it is renamed to stays_retired and locked, so nothing is lost and the rollback can
-- verify against it. A later migration drops it once the merge has proved itself.

-- 1. the booking columns ---------------------------------------------------------------------------------------------
alter table public.hotel_ideas
  add column if not exists is_stay boolean not null default false,
  add column if not exists check_in date,
  add column if not exists check_out date,
  add column if not exists stay_status text not null default 'Planned',
  add column if not exists confirmation text;

alter table public.hotel_ideas drop constraint if exists hotel_ideas_stay_status_ok;
alter table public.hotel_ideas add constraint hotel_ideas_stay_status_ok
  check (stay_status in ('Idea', 'Maybe', 'Planned', 'Priced', 'Booked', 'Done', 'Cancelled'));
alter table public.hotel_ideas drop constraint if exists hotel_ideas_stay_dates_ok;
alter table public.hotel_ideas add constraint hotel_ideas_stay_dates_ok
  check (check_out is null or check_in is null or check_out >= check_in);
create index if not exists hotel_ideas_stay_idx on public.hotel_ideas (trip_id) where is_stay;

-- hotel_ideas has column-limited grants, so the new columns are granted explicitly
grant select (is_stay, check_in, check_out, stay_status, confirmation) on public.hotel_ideas to authenticated;
grant insert (is_stay, check_in, check_out, stay_status, confirmation) on public.hotel_ideas to authenticated;
grant update (is_stay, check_in, check_out, stay_status, confirmation) on public.hotel_ideas to authenticated;

-- 2. an expense may be logged from a stay: that is now a hotel idea that is booked ------------------------------------
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
  -- checked here as well as by the CHECK constraint: a BEFORE trigger runs first
  if new.source_table is null or new.source_table not in ('flights', 'hotel_ideas') then
    raise exception 'An expense can only be linked to a flight or a stay' using errcode = '23514';
  end if;
  if new.source_table = 'hotel_ideas' then
    select exists (select 1 from public.hotel_ideas where id = new.source_id and trip_id = new.trip_id and is_stay) into ok;
  else
    select exists (select 1 from public.flights where id = new.source_id and trip_id = new.trip_id) into ok;
  end if;
  if not coalesce(ok, false) then
    raise exception 'The linked flight or stay is not part of this trip' using errcode = '23503';
  end if;
  return new;
end $$;

-- 3. move the data (only while the old table is still there, so a re-run does nothing) ---------------------------------
do $$
begin
  if to_regclass('public.stays') is null then
    return;
  end if;

  create temp table _stay_map on commit drop as
  select s.id as stay_id,
         case when i.id is not null and row_number() over (partition by i.id order by s.created_at, s.id) = 1 then i.id end as idea_id
    from public.stays s
    -- CASE, not AND: SQL does not promise that a regex test runs before a cast, and one junk ideaId must not stop the move
    cross join lateral (
      select case when s.details ->> 'ideaId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                  then (s.details ->> 'ideaId')::uuid end as linked_id
    ) l
    left join public.hotel_ideas i on i.trip_id = s.trip_id and i.id = l.linked_id;

  -- (a) a stay with an idea behind it is merged into that idea
  update public.hotel_ideas i
     set is_stay = true,
         check_in = s.check_in,
         check_out = s.check_out,
         stay_status = s.status,
         confirmation = s.confirmation,
         hotel = s.hotel,
         city = coalesce(s.city, i.city),
         room = coalesce(nullif(btrim(coalesce(s.note, '')), ''), i.room),
         total = coalesce(s.total, i.total),
         nights = case when s.check_in is not null and s.check_out is not null then (s.check_out - s.check_in) else i.nights end,
         details = i.details
                   || (coalesce(s.details, '{}'::jsonb) - 'ideaId')
                   || case when nullif(btrim(coalesce(s.room, '')), '') is not null then jsonb_build_object('rooms', s.room) else '{}'::jsonb end
    from public.stays s
    join _stay_map m on m.stay_id = s.id
   where m.idea_id = i.id;

  -- (b) every other stay becomes a new idea carrying the stay's own id
  insert into public.hotel_ideas (id, trip_id, hotel, city, room, nights, total, decision, details,
                                  is_stay, check_in, check_out, stay_status, confirmation, created_at)
  select s.id, s.trip_id, s.hotel, s.city, nullif(btrim(coalesce(s.note, '')), ''),
         case when s.check_in is not null and s.check_out is not null then (s.check_out - s.check_in) end,
         s.total, 'confirmed',
         (coalesce(s.details, '{}'::jsonb) - 'ideaId')
           || case when nullif(btrim(coalesce(s.room, '')), '') is not null then jsonb_build_object('rooms', s.room) else '{}'::jsonb end,
         true, s.check_in, s.check_out, s.status, s.confirmation, s.created_at
    from public.stays s
    join _stay_map m on m.stay_id = s.id
   where m.idea_id is null;

  -- (c) expenses that were logged from a stay now point at the hotel idea
  alter table public.expenses drop constraint if exists expenses_source_table_check;
  update public.expenses e
     set source_table = 'hotel_ideas', source_id = coalesce(m.idea_id, m.stay_id)
    from _stay_map m
   where e.source_table = 'stays' and e.source_id = m.stay_id;

  -- (d) nothing may be left behind: stop (changing nothing) if a stay or a link was missed
  if exists (select 1 from public.stays s join _stay_map m on m.stay_id = s.id
              where not exists (select 1 from public.hotel_ideas h where h.id = coalesce(m.idea_id, m.stay_id) and h.is_stay)) then
    raise exception 'a stay was not moved into hotel_ideas; nothing was changed';
  end if;
  if exists (select 1 from public.expenses where source_table = 'stays') then
    raise exception 'an expense still points at the old stays table; nothing was changed';
  end if;
end $$;

alter table public.expenses drop constraint if exists expenses_source_table_check;
alter table public.expenses add constraint expenses_source_table_check check (source_table in ('flights', 'hotel_ideas'));

-- 4. an expense logged from a stay is released when the stay's idea is deleted -------------------------------------------------
drop trigger if exists hotel_ideas_expense_source_gone on public.hotel_ideas;
create trigger hotel_ideas_expense_source_gone after delete on public.hotel_ideas
  for each row execute function public._expense_source_gone();

-- (Un-booking a stay keeps the expense's link: the delete of Remove-from-Stays has an Undo, and re-adding the stay shows it as
-- logged again. Deleting the idea itself still releases the expense, above.)

-- 5. the share link reads stays from hotel_ideas now ----------------------------------------------------------------------
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
               'hotel', h.hotel, 'city', h.city, 'check_in', h.check_in, 'check_out', h.check_out)
             order by h.check_in nulls last, h.created_at)
        from public.hotel_ideas h where h.trip_id = t.id and h.is_stay), '[]'::jsonb)
  );
end $$;

-- 6. retire the old table (kept for one release, unreachable from the app) ---------------------------------------------------
do $$
begin
  if to_regclass('public.stays') is not null then
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stays') then
      alter publication supabase_realtime drop table public.stays;
    end if;
    revoke all on public.stays from authenticated, anon;
    alter table public.stays rename to stays_retired;
    comment on table public.stays_retired is 'Merged into hotel_ideas (is_stay) by migration 31. Safe to drop once the merge has proved itself.';
  end if;
end $$;
