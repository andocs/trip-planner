-- #17: remove the old flights.booking_ref column. DESTRUCTIVE for that one column: take a backup first.
-- Rollback: supabase/rollback/rollback_000029.sql (restores the column and copies the references back).
--
-- Booking references moved to the owner-only flight_refs table in migration 13, but the old column stayed, readable by
-- every viewer through the API, until its values were moved. This migration does that, in one transaction:
--   1. copy any reference still in flights.booking_ref into flight_refs (only where the flight has none yet);
--   2. STOP, changing nothing, if any non-empty value could not be copied;
--   3. rewrite the has_ref trigger (it read the old column when a reference was deleted);
--   4. drop the column.
-- Pre-flight (run it first if you like): select count(*) from public.flights where btrim(coalesce(booking_ref, '')) <> '';

insert into public.flight_refs (flight_id, trip_id, booking_ref)
select f.id, f.trip_id, left(btrim(f.booking_ref), 40)
  from public.flights f
 where btrim(coalesce(f.booking_ref, '')) <> ''
   and not exists (select 1 from public.flight_refs r where r.flight_id = f.id)
on conflict (flight_id) do nothing;

do $$
declare missing integer;
begin
  select count(*) into missing
    from public.flights f
   where btrim(coalesce(f.booking_ref, '')) <> ''
     and not exists (select 1 from public.flight_refs r where r.flight_id = f.id);
  if missing > 0 then
    raise exception '% flight booking reference(s) could not be copied to flight_refs; nothing was dropped', missing;
  end if;
end $$;

-- Deleting a reference clears the flag; the flag no longer depends on the old column.
create or replace function public._flight_refs_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.flights set has_ref = false where id = old.flight_id;
    return old;
  end if;
  update public.flights set has_ref = true where id = new.flight_id and has_ref is distinct from true;
  return new;
end $$;

alter table public.flights drop column booking_ref;
