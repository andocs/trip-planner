-- Phase 4: pictures on ideas. Additive. Rollback: supabase/rollback/rollback_item_images.sql.
--
-- 1. item_images: the photos of a draft/idea (hotel_ideas, food_places, attractions). The photo with the lowest
--    `position` is the card's cover. A photo is one of three kinds:
--      upload     a file in the private Storage bucket `trip-photos` (resized on the phone to about 1280 px),
--      link       an https picture address found on a page the owner pasted (we keep the address, not a copy),
--      wikimedia  a freely licensed Wikimedia Commons picture, with its author and licence.
-- 2. The Storage bucket `trip-photos` (private; signed links are issued to people who can see the trip) and its
--    policies: read = can_view, write/delete = can_edit, and only inside the trip's own folder `<trip_id>/`.
--    Writes stop at a hard storage cap (900 MB, 90% of the free plan's 1 GB), enforced by the database.
-- 3. photo_storage_status(): used / cap bytes, for the owner's storage meter.

-- ---------------------------------------------------------------------------
-- 1. item_images
-- ---------------------------------------------------------------------------
create table public.item_images (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  item_table  text not null check (item_table in ('hotel_ideas', 'food_places', 'attractions')),
  item_id     uuid not null,
  source      text not null check (source in ('upload', 'link', 'wikimedia')),
  storage_path text,
  url         text,
  page_url    text,
  credit      text check (credit is null or char_length(credit) <= 200),
  license     text check (license is null or char_length(license) <= 60),
  license_url text check (license_url is null or (license_url ~ '^https://[^[:space:]]+$' and char_length(license_url) <= 600)),
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  -- coalesce: a missing value makes a test NULL, and a CHECK lets NULL through, so NULL must count as a failure
  constraint item_images_shape check (coalesce(
    case source
      -- a file in this trip's own folder, nothing else
      when 'upload' then url is null and page_url is null
        and storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
        and split_part(storage_path, '/', 1) = trip_id::text
      -- an https picture address (the browser loads it directly, with no referrer)
      when 'link' then storage_path is null
        and url ~ '^https://[^[:space:]]+$' and char_length(url) <= 1000
        and (page_url is null or (page_url ~ '^https://[^[:space:]]+$' and char_length(page_url) <= 1000))
      -- a Commons picture: only the two Wikimedia hosts, and the credit page is required
      when 'wikimedia' then storage_path is null
        and url ~ '^https://upload\.wikimedia\.org/[^[:space:]]+$' and char_length(url) <= 600
        and page_url ~ '^https://commons\.wikimedia\.org/[^[:space:]]+$' and char_length(page_url) <= 600
      else false
    end, false))
);
create index item_images_item_idx on public.item_images (item_table, item_id, position);
create index item_images_trip_idx on public.item_images (trip_id);
create unique index item_images_path_idx on public.item_images (storage_path) where storage_path is not null;

alter table public.item_images enable row level security;
revoke all on public.item_images from anon;

create policy item_images_select on public.item_images for select to authenticated using (public.can_view(trip_id));
create policy item_images_insert on public.item_images for insert to authenticated
  with check (public.can_edit(trip_id) and public._item_in_trip(item_table, item_id, trip_id));
create policy item_images_update on public.item_images for update to authenticated
  using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));
create policy item_images_delete on public.item_images for delete to authenticated using (public.can_edit(trip_id));

-- Only the order and the credit text can change afterwards; never the file, the address or which idea it belongs to.
revoke update on public.item_images from authenticated;
grant update (position, credit) on public.item_images to authenticated;

-- At most 12 photos per idea, so one idea cannot fill the storage.
create or replace function public._item_images_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.item_images where item_table = new.item_table and item_id = new.item_id) >= 12 then
    raise exception 'An idea can have at most 12 photos' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger item_images_limit before insert on public.item_images for each row execute function public._item_images_limit();

-- A photo has no foreign key to its idea (the pair is polymorphic), so remove the rows with the idea.
-- The files in Storage are removed by the app (Storage API) or by scripts/photo-orphans.ts.
create or replace function public._item_images_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.item_images where item_table = tg_table_name and item_id = old.id;
  return old;
end $$;
do $$
declare t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('create trigger %I after delete on public.%I for each row execute function public._item_images_cleanup()', t || '_item_images_cleanup', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Storage: the private bucket and who may touch it
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The trip a file belongs to, from its path `<trip_id>/<file id>.<ext>`; null for any other shape.
create or replace function public._photo_path_trip(p_name text)
returns uuid
language sql
immutable
as $$
  select case when p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

-- Bytes in the bucket. Internal: policies call it; the owner reads it through photo_storage_status().
create or replace function public._photo_storage_bytes()
returns bigint
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(nullif(metadata ->> 'size', '')::bigint), 0)
    from storage.objects where bucket_id = 'trip-photos';
$$;

-- Hard cap: 900 MB, 90% of the free plan's 1 GB. Change this function if the project moves to a bigger plan.
create or replace function public.photo_storage_cap()
returns bigint
language sql
immutable
as $$ select (900 * 1024 * 1024)::bigint $$;

create or replace function public.photo_storage_status()
returns table (used bigint, cap bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select public._photo_storage_bytes(), public.photo_storage_cap();
end $$;

revoke all on function public._photo_path_trip(text) from public, anon;
revoke all on function public._photo_storage_bytes() from public, anon;
revoke all on function public.photo_storage_cap() from public, anon;
revoke all on function public.photo_storage_status() from public, anon;
grant execute on function public._photo_path_trip(text) to authenticated;
grant execute on function public._photo_storage_bytes() to authenticated;
grant execute on function public.photo_storage_cap() to authenticated;
grant execute on function public.photo_storage_status() to authenticated;

create policy trip_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'trip-photos' and public._photo_path_trip(name) is not null
         and public.can_view(public._photo_path_trip(name)));
create policy trip_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-photos' and public._photo_path_trip(name) is not null
              and public.can_edit(public._photo_path_trip(name))
              and public._photo_storage_bytes() < public.photo_storage_cap());
create policy trip_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and public._photo_path_trip(name) is not null
         and public.can_edit(public._photo_path_trip(name)));
-- No update policy: a file is never replaced in place.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.item_images;
