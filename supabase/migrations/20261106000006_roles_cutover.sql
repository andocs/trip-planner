-- Roles, cutover step. Ship together with the app update: after this, only the owner can write.
-- One transaction (migrations run in one): the permissive policies are dropped and the role-based
-- ones created together, so writes are never open and reads are never closed.
-- Roll back with supabase/rollback/rollback_cutover.sql (restores the old policies and functions).

-- ---------------------------------------------------------------------------
-- 1. Replace the policies
-- ---------------------------------------------------------------------------
drop policy if exists trips_select on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trip_members_select on public.trip_members;

create policy trips_select on public.trips for select to authenticated using (public.can_view(id));
create policy trips_update on public.trips for update to authenticated
  using (public.can_edit(id) and archived_at is null)
  with check (public.can_edit(id));

-- Owners see everyone on their trip; everyone else sees only their own row.
create policy trip_members_select on public.trip_members for select to authenticated
  using (user_id = auth.uid() or public.can_edit(trip_id));

do $$
declare t text;
begin
  foreach t in array array['travelers', 'destinations', 'categories', 'expenses', 'itinerary_items', 'flights',
    'transfers', 'stays', 'hotel_ideas', 'food_places', 'menu_items', 'attractions', 'packing_items', 'gifts', 'reminders'] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_view(trip_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit(trip_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit(trip_id))', t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. RPCs
-- ---------------------------------------------------------------------------

-- The caller's active trip (zero or one row). Drafts are visible to their editors only.
create or replace function public.active_trip()
returns setof public.trips
language sql
security definer
stable
set search_path = public
as $$
  select t.*
  from public.trips t
  join public.trip_members m on m.trip_id = t.id
  where m.user_id = auth.uid() and m.revoked_at is null and t.archived_at is null
    and (t.status = 'active' or public.can_edit(t.id))
  order by m.joined_at desc, t.created_at desc
  limit 1;
$$;

-- Admin only. Returns the owner's existing draft if there is one.
create or replace function public.create_trip(p_name text default 'My Trip')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can create trips' using errcode = '42501';
  end if;
  select id into new_id from public.trips
   where owner_id = uid and status = 'draft' and archived_at is null limit 1;
  if new_id is not null then return new_id; end if;

  insert into public.trips (name, owner_id) values (coalesce(nullif(trim(p_name), ''), 'My Trip'), uid) returning id into new_id;
  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (new_id, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name');
  perform public._insert_default_categories(new_id);
  return new_id;
end $$;

-- Joins the trip that owns the token as a VIEWER. Idempotent. Never changes an existing role.
-- A viewer whose access was removed after the link was last replaced stays out; one who was cut off
-- by a link replacement can come back with the new link.
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

-- New invite token; viewers who joined with the old link lose access.
create or replace function public.regenerate_invite(p_trip uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text;
  ts timestamptz := clock_timestamp();  -- one instant for both columns (now() is frozen inside a transaction)
begin
  perform public._require_user();
  if not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can replace the invite link' using errcode = '42501';
  end if;
  update public.trips
     set join_token = encode(extensions.gen_random_bytes(12), 'hex'), invite_rotated_at = ts
   where id = p_trip and archived_at is null
  returning join_token into tok;
  if tok is null then
    raise exception 'Trip is archived' using errcode = 'P0002';
  end if;
  update public.trip_members set revoked_at = ts where trip_id = p_trip and role = 'viewer' and revoked_at is null;
  return tok;
end $$;

-- Old name kept so a tab running the previous app version still works during rollout.
create or replace function public.regenerate_join_token(p_trip uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select public.regenerate_invite(p_trip);
$$;

create or replace function public.revoke_viewer(p_trip uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_user();
  if not public.can_edit(p_trip) then
    raise exception 'Only the trip owner can remove viewers' using errcode = '42501';
  end if;
  update public.trip_members set revoked_at = clock_timestamp()
   where trip_id = p_trip and user_id = p_user and role = 'viewer' and revoked_at is null;
end $$;

-- Archives the owner's active trip and starts a fresh one. Current viewers carry over and the invite
-- link moves with them; the old trip stays archived.
create or replace function public.start_new_trip(p_copy_setup boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  old public.trips;
  new_id uuid;
  old_token text;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can start a trip' using errcode = '42501';
  end if;
  select * into old from public.active_trip();
  if old.id is null then
    return public.create_trip();
  end if;
  if not public.can_edit(old.id) then
    raise exception 'Only the trip owner can start a new trip' using errcode = '42501';
  end if;

  old_token := old.join_token;
  update public.trips
     set archived_at = now(), status = 'archived', join_token = encode(extensions.gen_random_bytes(12), 'hex')
   where id = old.id;

  insert into public.trips (join_token, owner_id, home_currency, foreign_currency, rate, map_region)
  values (
    old_token, uid,
    case when p_copy_setup then old.home_currency else 'PHP' end,
    case when p_copy_setup then old.foreign_currency else 'USD' end,
    case when p_copy_setup then old.rate else 1 end,
    case when p_copy_setup then old.map_region else 'world' end)
  returning id into new_id;

  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (new_id, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name');
  insert into public.trip_members (trip_id, user_id, role, email, label)
  select new_id, m.user_id, 'viewer', m.email, m.label
    from public.trip_members m
   where m.trip_id = old.id and m.role = 'viewer' and m.revoked_at is null;

  perform public._insert_default_categories(new_id);
  if p_copy_setup then
    insert into public.travelers (trip_id, name, sort)
    select new_id, name, sort from public.travelers where trip_id = old.id;
  end if;
  return new_id;
end $$;

-- Trips created before owners existed, for the one-time "Claim this trip" step. Admin only.
create or replace function public.claimable_trips()
returns setof public.trips
language sql
security definer
stable
set search_path = public
as $$
  select t.* from public.trips t
   where public.is_admin() and t.owner_id is null and t.archived_at is null
   order by t.created_at;
$$;

create or replace function public.claim_trip(p_trip uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public._require_user();
  n int;
begin
  if not public.is_admin() then
    raise exception 'Only the trip owner can claim a trip' using errcode = '42501';
  end if;
  update public.trips set owner_id = uid where id = p_trip and owner_id is null and archived_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'This trip is already claimed or no longer exists' using errcode = 'P0002';
  end if;
  insert into public.trip_members (trip_id, user_id, role, email, label)
  values (p_trip, uid, 'owner', lower(auth.jwt() ->> 'email'), auth.jwt() -> 'user_metadata' ->> 'full_name')
  on conflict (trip_id, user_id) do update set role = 'owner', revoked_at = null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.regenerate_invite(uuid) from public, anon;
revoke all on function public.revoke_viewer(uuid, uuid) from public, anon;
revoke all on function public.claimable_trips() from public, anon;
revoke all on function public.claim_trip(uuid) from public, anon;
revoke all on function public.regenerate_join_token(uuid) from public, anon;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.revoke_viewer(uuid, uuid) to authenticated;
grant execute on function public.claimable_trips() to authenticated;
grant execute on function public.claim_trip(uuid) to authenticated;
grant execute on function public.regenerate_join_token(uuid) to authenticated;
