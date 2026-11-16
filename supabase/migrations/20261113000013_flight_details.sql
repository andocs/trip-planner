-- Phase 5: flights as boarding passes. Additive and safe to run more than once. Rollback: supabase/rollback/rollback_flight_details.sql.
--
-- 1. Optional details on a flight: terminal, gate, seat and the flight time in minutes. All nullable.
-- 2. The booking reference (PNR) moves to its own table, flight_refs, that only the owner (an editor) can read or write.
--    A booking reference can be used to change or cancel a booking, so a viewer must not be able to read it from the
--    API either, not just see it hidden on screen. Viewers still learn THAT a flight has a reference (flights.has_ref),
--    never what it is.
--
-- Nothing existing is rewritten here. The old flights.booking_ref column and its values are left exactly as they are, so
-- until you run supabase/proposals/move_booking_refs.sql (a separate step, shown for approval first) a viewer who calls
-- the API directly can still read the old values. The app stops showing them to viewers right away.

alter table public.flights add column if not exists terminal text check (terminal is null or char_length(terminal) <= 10);
alter table public.flights add column if not exists gate text check (gate is null or char_length(gate) <= 10);
alter table public.flights add column if not exists seat text check (seat is null or char_length(seat) <= 10);
alter table public.flights add column if not exists duration_min integer check (duration_min is null or duration_min between 1 and 3000);
alter table public.flights add column if not exists has_ref boolean not null default false;

create table if not exists public.flight_refs (
  id          uuid primary key default gen_random_uuid(),
  flight_id   uuid not null unique references public.flights (id) on delete cascade,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  booking_ref text not null check (char_length(btrim(booking_ref)) between 1 and 40),
  created_at  timestamptz not null default now()
);
create index if not exists flight_refs_trip_idx on public.flight_refs (trip_id);

alter table public.flight_refs enable row level security;
revoke all on public.flight_refs from anon;

-- Only people who can EDIT the trip can read or write a booking reference. A viewer gets no rows, not an error.
drop policy if exists flight_refs_select on public.flight_refs;
drop policy if exists flight_refs_insert on public.flight_refs;
drop policy if exists flight_refs_update on public.flight_refs;
drop policy if exists flight_refs_delete on public.flight_refs;
create policy flight_refs_select on public.flight_refs for select to authenticated using (public.can_edit(trip_id));
create policy flight_refs_insert on public.flight_refs for insert to authenticated with check (public.can_edit(trip_id));
create policy flight_refs_update on public.flight_refs for update to authenticated
  using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy flight_refs_delete on public.flight_refs for delete to authenticated using (public.can_edit(trip_id));

-- Only the reference text can change afterwards; never which flight or trip it belongs to.
revoke update on public.flight_refs from authenticated;
grant update (booking_ref) on public.flight_refs to authenticated;

-- The flight must belong to the same trip, and the "has a reference" flag follows the table.
create or replace function public._flight_refs_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.flights where id = new.flight_id and trip_id = new.trip_id) then
    raise exception 'The flight is not part of this trip' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace function public._flight_refs_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.flights set has_ref = (booking_ref is not null) where id = old.flight_id;
    return old;
  end if;
  update public.flights set has_ref = true where id = new.flight_id and has_ref is distinct from true;
  return new;
end $$;

drop trigger if exists flight_refs_guard on public.flight_refs;
create trigger flight_refs_guard before insert on public.flight_refs
  for each row execute function public._flight_refs_guard();
drop trigger if exists flight_refs_flag on public.flight_refs;
create trigger flight_refs_flag after insert or delete on public.flight_refs
  for each row execute function public._flight_refs_flag();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flight_refs') then
    alter publication supabase_realtime add table public.flight_refs;
  end if;
end $$;
