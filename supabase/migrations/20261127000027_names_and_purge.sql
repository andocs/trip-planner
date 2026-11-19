-- Audit follow-ups (#13, #14). Function replacements only, no table changes.
-- Rollback: supabase/rollback/rollback_000027.sql
--
-- 1. purge_stale_place_coords() could be run by any signed-in user. Harmless, but it is an owner chore, so it now
--    requires the admin (the app only calls it when the owner opens Discover).
-- 2. A person who joins by link names themselves (their Google or profile name), so they could pick another
--    traveler's name ("Jam") and pass for them. A linked traveler's name is now made unique within the trip:
--    "Jam" becomes "Jam (2)" when a traveler called Jam already exists. The owner can still rename anyone.

create or replace function public.purge_stale_place_coords()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.place_refs set lat = null, lng = null, coords_at = null
   where coords_at is not null and coords_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public._unique_traveler_name(p_trip uuid, p_name text, p_user uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text := left(trim(p_name), 60);
  cand text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.travelers
     where trip_id = p_trip and lower(trim(name)) = lower(cand) and user_id is distinct from p_user
  ) loop
    n := n + 1;
    cand := base || ' (' || n || ')';
  end loop;
  return cand;
end $$;
revoke all on function public._unique_traveler_name(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.join_trip(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  t public.trips;
  m public.trip_members;
  was_in boolean;
  who text;
begin
  select * into t from public.trips where join_token = p_token and archived_at is null;
  if t.id is null then
    raise exception 'Invite link is invalid or has expired' using errcode = 'P0002';
  end if;

  select * into m from public.trip_members where trip_id = t.id and user_id = uid;
  if m.user_id is not null and m.revoked_at is not null and m.revoked_at > t.invite_rotated_at then
    raise exception 'Your access to this trip was removed' using errcode = '42501';
  end if;
  was_in := m.user_id is not null and m.revoked_at is null;

  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (t.id, uid, 'viewer', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name')
  on conflict (trip_id, user_id) do update
    set joined_at = now(),
        -- coming back from a removal never restores a higher role
        role = case when public.trip_members.revoked_at is not null then 'viewer' else public.trip_members.role end,
        revoked_at = null,
        email = coalesce(excluded.email, public.trip_members.email),
        label = coalesce(excluded.label, public.trip_members.label);

  select * into m from public.trip_members where trip_id = t.id and user_id = uid;
  if not was_in and m.role = 'viewer' then
    who := coalesce(nullif(trim(coalesce(m.label, '')), ''), nullif(split_part(coalesce(m.email, ''), '@', 1), ''), 'Guest');
    who := public._unique_traveler_name(t.id, who, uid);
    insert into public.travelers (trip_id, name, sort, user_id)
    values (t.id, who, coalesce((select max(sort) from public.travelers where trip_id = t.id), 0) + 1, uid)
    on conflict (trip_id, user_id) where user_id is not null do nothing;
  end if;
  return t.id;
end $$;

create or replace function public.sync_my_membership()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  em text;
  nm text;
begin
  select lower(u.email),
         nullif(trim(coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           (select i.identity_data ->> 'full_name' from auth.identities i where i.user_id = uid and i.provider = 'google' limit 1),
           (select i.identity_data ->> 'name' from auth.identities i where i.user_id = uid and i.provider = 'google' limit 1),
           ''
         )), '')
    into em, nm
    from auth.users u
   where u.id = uid;

  update public.trip_members
     set email = coalesce(em, email),
         label = coalesce(nullif(trim(coalesce(label, '')), ''), nm)
   where user_id = uid;

  update public.travelers
     set name = public._unique_traveler_name(
           trip_id, coalesce(nm, nullif(split_part(coalesce(em, ''), '@', 1), ''), name), uid)
   where user_id = uid and name = 'Guest';
end $$;
