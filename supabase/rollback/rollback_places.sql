-- Undo 20261110000010_places.sql. Drops the place links, the quota tables and their functions.
alter publication supabase_realtime drop table public.place_refs;
do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_place_refs_cleanup', t);
  end loop;
end $$;
drop function if exists public._place_refs_cleanup();
drop function if exists public.purge_stale_place_coords();
drop table if exists public.place_refs;
drop function if exists public.reserve_api_call(text);
drop table if exists public.place_fetch_log;
drop table if exists public.api_usage;
drop table if exists public.api_caps;
