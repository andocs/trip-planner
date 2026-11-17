-- Rollback for 20261117000017_activity_photos.sql.
-- Photos of activities are deleted first (the old check would reject them). Their files in Storage are removed by
-- scripts/photo-orphans.ts.
drop trigger if exists itinerary_items_item_images_cleanup on public.itinerary_items;
delete from public.item_images where item_table = 'itinerary_items';
alter table public.item_images drop constraint if exists item_images_item_table_ok;
alter table public.item_images
  add constraint item_images_item_table_check check (item_table in ('hotel_ideas', 'food_places', 'attractions'));
