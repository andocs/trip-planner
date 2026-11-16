-- Undo 20261113000013_flight_details.sql. DESTRUCTIVE for booking references typed AFTER that migration: they live only in
-- flight_refs, which this drops. References that still sit in the old flights.booking_ref column are untouched.
-- To keep new references, copy them back first:
--   update public.flights f set booking_ref = r.booking_ref from public.flight_refs r where r.flight_id = f.id;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flight_refs') then
    alter publication supabase_realtime drop table public.flight_refs;
  end if;
end $$;
drop trigger if exists flight_refs_flag on public.flight_refs;
drop trigger if exists flight_refs_guard on public.flight_refs;
drop function if exists public._flight_refs_flag();
drop function if exists public._flight_refs_guard();
drop table if exists public.flight_refs;
alter table public.flights drop column if exists has_ref;
alter table public.flights drop column if exists duration_min;
alter table public.flights drop column if exists seat;
alter table public.flights drop column if exists gate;
alter table public.flights drop column if exists terminal;
