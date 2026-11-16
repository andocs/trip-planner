-- PROPOSAL, NOT RUN. Needs your approval first (it rewrites existing data).
--
-- Moves the booking references that were typed before migration 13 out of flights.booking_ref (readable by every viewer
-- through the API) into flight_refs (owner/editor only), then clears the old column. Run it once, after migration 13.
--
-- Safe to re-run: it only copies rows that have no reference in flight_refs yet, and only clears values it has copied.
-- It touches nothing but booking references. Take a backup (or note the values) first if you want a way back; the
-- rollback is the commented line at the bottom.

begin;

-- 1. copy (the guard trigger checks the flight belongs to the trip; has_ref follows by trigger)
insert into public.flight_refs (flight_id, trip_id, booking_ref)
select f.id, f.trip_id, btrim(f.booking_ref)
  from public.flights f
 where f.booking_ref is not null
   and btrim(f.booking_ref) <> ''
   and not exists (select 1 from public.flight_refs r where r.flight_id = f.id)
on conflict (flight_id) do nothing;

-- 2. clear the old column only where the copy exists
update public.flights f
   set booking_ref = null
  from public.flight_refs r
 where r.flight_id = f.id
   and f.booking_ref is not null;

-- 3. check: this should return 0 (no reference is left readable in flights)
select count(*) as still_readable_by_viewers from public.flights where booking_ref is not null;

commit;

-- rollback (puts them back):
--   update public.flights f set booking_ref = r.booking_ref from public.flight_refs r where r.flight_id = f.id;
