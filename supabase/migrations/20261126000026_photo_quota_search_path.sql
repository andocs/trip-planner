-- Audit follow-ups (2026-11-19). Additive. Rollback: supabase/rollback/rollback_000026.sql
--
-- 1. One trip can hold at most 300 photos. The 900 MB cap is shared by the whole project, so a single editor
--    could otherwise use all of it. (There is already a limit of 12 photos per idea.)
-- 2. _photo_path_trip() and photo_storage_cap() get a fixed search_path, like every other function here.

create or replace function public._item_images_trip_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.item_images where trip_id = new.trip_id) >= 300 then
    raise exception 'A trip can have at most 300 photos' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists item_images_trip_limit on public.item_images;
create trigger item_images_trip_limit before insert on public.item_images
  for each row execute function public._item_images_trip_limit();

alter function public._photo_path_trip(text) set search_path = public;
alter function public.photo_storage_cap() set search_path = public;
