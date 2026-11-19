-- Fixes found by running migrations 17 and 18 against Postgres for the first time (2026-11-19).
-- Additive: one policy replaced, one column grant added. Rollback: supabase/rollback/rollback_000024.sql
--
-- 1. Activity photos (migration 17) could never be inserted: item_images_insert required _item_in_trip(), which
--    only knows the three idea tables. The add sheet also creates its photos BEFORE the activity row exists, so the
--    activity id cannot be checked. Activity photos are still limited to people who can edit the trip, and the trip
--    id on the row is what scopes them (reads use can_view(trip_id); the 12-photo limit and cleanup trigger apply).
-- 2. trips.timezone (migration 18) was added without UPDATE rights: trips has a column-limited grant, so the
--    owner's "Home time zone" setting was refused. The existing trips update policy still decides who may write.

drop policy if exists item_images_insert on public.item_images;
create policy item_images_insert on public.item_images for insert to authenticated
  with check (
    public.can_edit(trip_id)
    and (item_table = 'itinerary_items' or public._item_in_trip(item_table, item_id, trip_id))
  );

grant update (timezone) on public.trips to authenticated;
