-- The invite link (trips.join_token) is for the owner only (audit 2026-11-19).
-- Until now every member could read it: through the table, through active_trip() / trip_bootstrap(), and
-- through Realtime row events, so a viewer or editor could re-share the link or learn a rotated one.
-- Rollback: supabase/rollback/rollback_000025.sql
--
-- 1. active_trip() (and so trip_bootstrap(), which calls it) returns join_token = '' unless the caller owns the trip.
-- 2. Signed-in users may SELECT every trips column EXCEPT join_token. When you add a column to trips, add it to
--    this grant and to the Realtime column list below.
-- 3. Realtime sends only the listed columns, so row events never carry the token.
-- Owners get their token from active_trip(); join_trip, regenerate_invite and start_new_trip are security definer
-- and are unaffected.

create or replace function public.active_trip()
returns setof public.trips
language plpgsql
security definer
stable
set search_path = public
as $$
declare t public.trips;
begin
  for t in
    select x.*
      from public.trips x
      join public.trip_members m on m.trip_id = x.id
     where m.user_id = auth.uid() and m.revoked_at is null and x.archived_at is null
     order by m.joined_at desc, x.created_at desc
     limit 1
  loop
    if not public.is_trip_owner(t.id) then t.join_token := ''; end if;
    return next t;
  end loop;
end $$;

revoke select on public.trips from authenticated;
grant select (id, name, destination, start_date, end_date, home_currency, foreign_currency, rate, rate_date, budget,
              map_region, archived_at, created_at, owner_id, status, onboarding_step, invite_rotated_at, timezone)
  on public.trips to authenticated;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips') then
    alter publication supabase_realtime drop table public.trips;
  end if;
  alter publication supabase_realtime add table public.trips
    (id, name, destination, start_date, end_date, home_currency, foreign_currency, rate, rate_date, budget,
     map_region, archived_at, created_at, owner_id, status, onboarding_step, invite_rotated_at, timezone);
end $$;
