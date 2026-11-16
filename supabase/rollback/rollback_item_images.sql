-- Undo 20261111000011_item_images.sql. Drops the photo table, the Storage policies and the helper functions.
-- The bucket `trip-photos` and its files are NOT removed here: Supabase only allows deleting files through the Storage API.
-- To remove them too, empty the bucket in the dashboard (Storage -> trip-photos) and delete it there.
alter publication supabase_realtime drop table public.item_images;
drop policy if exists trip_photos_read on storage.objects;
drop policy if exists trip_photos_insert on storage.objects;
drop policy if exists trip_photos_delete on storage.objects;
do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_item_images_cleanup', t);
  end loop;
end $$;
drop function if exists public._item_images_cleanup();
drop table if exists public.item_images;
drop function if exists public._item_images_limit();
drop function if exists public.photo_storage_status();
drop function if exists public.photo_storage_cap();
drop function if exists public._photo_storage_bytes();
drop function if exists public._photo_path_trip(text);
