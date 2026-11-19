-- Security hardening (audit 2026-11-19). Two function replacements, no table changes.
-- Rollback: supabase/rollback/rollback_000023.sql
--
-- 1. is_admin(): the old check trusted app_metadata.providers containing 'google' plus the JWT email.
--    A password account created with the admin's email that then links ANY Google account would pass.
--    Now the admin email must belong to a verified Google identity of the caller.
-- 2. join_trip(): a removed editor could return as an editor once the link was rotated (the row kept
--    its role). Anyone coming back from a revoked row now rejoins as a viewer.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1
         from auth.identities i
         join public.app_admins a on a.email = lower(i.identity_data ->> 'email')
        where i.user_id = auth.uid()
          and i.provider = 'google'
          and coalesce((i.identity_data ->> 'email_verified')::boolean, false)
     );
$$;

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
    insert into public.travelers (trip_id, name, sort, user_id)
    values (t.id, who, coalesce((select max(sort) from public.travelers where trip_id = t.id), 0) + 1, uid)
    on conflict (trip_id, user_id) where user_id is not null do nothing;
  end if;
  return t.id;
end $$;
