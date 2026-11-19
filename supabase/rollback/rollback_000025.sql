-- Rollback for 20261125000025_hide_invite_token.sql: every member can read the invite link again.
create or replace function public.active_trip()
returns setof public.trips
language sql
security definer
stable
set search_path = public
as $$
  select t.*
  from public.trips t
  join public.trip_members m on m.trip_id = t.id
  where m.user_id = auth.uid() and m.revoked_at is null and t.archived_at is null
  order by m.joined_at desc, t.created_at desc
  limit 1;
$$;

grant select on public.trips to authenticated;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trips') then
    alter publication supabase_realtime drop table public.trips;
  end if;
  alter publication supabase_realtime add table public.trips;
end $$;
