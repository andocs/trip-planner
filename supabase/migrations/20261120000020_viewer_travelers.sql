-- A person who joins with the invite link also becomes a traveler (someone who can share costs), once.
-- Additive: one nullable column, one partial unique index, and join_trip extended.
--   * travelers.user_id links a traveler to the invited person's account (null for everyone added by hand).
--   * join_trip adds the traveler only when the person is newly joined (or comes back after being removed),
--     so a traveler the owner deleted is not brought back every time the link is opened again.
--   * Owners opening their own link never become a second traveler (only role = 'viewer' counts).
-- Existing viewers are not touched; the owner can add them with "Add as traveler" in Settings.

alter table public.travelers add column if not exists user_id uuid;
create unique index if not exists travelers_trip_user_key on public.travelers (trip_id, user_id) where user_id is not null;

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
