-- Rollback for 20261126000026_photo_quota_search_path.sql
drop trigger if exists item_images_trip_limit on public.item_images;
drop function if exists public._item_images_trip_limit();
alter function public._photo_path_trip(text) reset search_path;
alter function public.photo_storage_cap() reset search_path;
