-- Rollback for 20261120000020_viewer_travelers.sql. join_trip goes back to the version from migration 6;
-- travelers made from invites stay (they are ordinary travelers), only the link column goes.
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
begin
  select * into t from public.trips where join_token = p_token and archived_at is null;
  if t.id is null then
    raise exception 'Invite link is invalid or has expired' using errcode = 'P0002';
  end if;

  select * into m from public.trip_members where trip_id = t.id and user_id = uid;
  if m.user_id is not null and m.revoked_at is not null and m.revoked_at > t.invite_rotated_at then
    raise exception 'Your access to this trip was removed' using errcode = '42501';
  end if;

  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (t.id, uid, 'viewer', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name')
  on conflict (trip_id, user_id) do update
    set joined_at = now(),
        revoked_at = null,
        email = coalesce(excluded.email, public.trip_members.email),
        label = coalesce(excluded.label, public.trip_members.label);
  return t.id;
end $$;

drop index if exists public.travelers_trip_user_key;
alter table public.travelers drop column if exists user_id;
