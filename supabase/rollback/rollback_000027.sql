-- Rollback for 20261127000027_names_and_purge.sql: previous purge_stale_place_coords, join_trip, sync_my_membership.

create or replace function public.purge_stale_place_coords()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.place_refs set lat = null, lng = null, coords_at = null
   where coords_at is not null and coords_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

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
        role = case when public.trip_members.revoked_at is not null then 'viewer' else public.trip_members.role end,
        revoked_at = null,
        email = coalesce(excluded.email, public.trip_members.email),
        label = coalesce(excluded.label, public.trip_members.label);

  select * into m from public.trip_members where trip_id = t.id and user_id = uid;
  if not was_in and m.role = 'viewer' then
    who := coalesce(nullif(trim(coalesce(m.label, '')), ''), nullif(split_part(coalesce(m.email, ''), '@', 1), ''), 'Guest');
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
     set name = coalesce(nm, nullif(split_part(coalesce(em, ''), '@', 1), ''), name)
   where user_id = uid and name = 'Guest';
end $$;

drop function if exists public._unique_traveler_name(uuid, text, uuid);
