-- Rollback for 20261124000024_fix_activity_photos_and_timezone.sql (restores the broken behaviour).
drop policy if exists item_images_insert on public.item_images;
create policy item_images_insert on public.item_images for insert to authenticated
  with check (public.can_edit(trip_id) and public._item_in_trip(item_table, item_id, trip_id));

revoke update (timezone) on public.trips from authenticated;
