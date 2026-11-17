-- Phase 8: time zones. Additive and idempotent. Rollback: supabase/rollback/rollback_000018.sql.
--
-- 1. trips.timezone: the trip's home time zone (an IANA id such as Asia/Manila). Existing trips read as Asia/Manila.
-- 2. flights.dep_tz / flights.arr_tz: the zone of each airport. Null means "not set": the flight time is then only shown
--    when the owner typed it (as before). With both set, the app works the flight time out from the two local times.
--
-- The ids are free text of a sane length; the app only offers real zones and checks them with Intl before saving.
-- No policy changes: the existing trips and flights policies already limit who can write these columns.

alter table public.trips add column if not exists timezone text not null default 'Asia/Manila';
alter table public.trips drop constraint if exists trips_timezone_ok;
alter table public.trips add constraint trips_timezone_ok check (char_length(timezone) between 1 and 64);

alter table public.flights add column if not exists dep_tz text;
alter table public.flights add column if not exists arr_tz text;
alter table public.flights drop constraint if exists flights_dep_tz_ok;
alter table public.flights drop constraint if exists flights_arr_tz_ok;
alter table public.flights add constraint flights_dep_tz_ok check (dep_tz is null or char_length(dep_tz) between 1 and 64);
alter table public.flights add constraint flights_arr_tz_ok check (arr_tz is null or char_length(arr_tz) between 1 and 64);
