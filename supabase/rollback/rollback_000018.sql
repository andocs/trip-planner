-- Rollback for 20261118000018_timezones.sql. The zones are dropped; flight times typed by hand are kept.
alter table public.flights drop constraint if exists flights_dep_tz_ok;
alter table public.flights drop constraint if exists flights_arr_tz_ok;
alter table public.flights drop column if exists dep_tz, drop column if exists arr_tz;
alter table public.trips drop constraint if exists trips_timezone_ok;
alter table public.trips drop column if exists timezone;
