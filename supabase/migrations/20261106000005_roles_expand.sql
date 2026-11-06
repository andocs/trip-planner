-- Roles, expand step. Purely additive: nothing here changes who can read or write today.
-- The access change lives in the next migration (…06_roles_cutover.sql), shipped with the app update.

-- ---------------------------------------------------------------------------
-- Who may own trips: Google accounts whose lowercase email is listed here.
-- Insert yourself once:  insert into app_admins(email) values ('you@gmail.com');
-- ---------------------------------------------------------------------------
create table if not exists public.app_admins (
  email text primary key check (email = lower(email))
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- trips: owner and lifecycle
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  add column if not exists onboarding_step int not null default 1,
  add column if not exists invite_rotated_at timestamptz not null default now();

-- Existing rows already took the defaults (status 'active'); keep status honest for archived ones.
update public.trips set status = 'archived' where archived_at is not null and status <> 'archived';

-- ---------------------------------------------------------------------------
-- trip_members: role + enough identity to list and revoke viewers
-- Every existing row becomes a viewer (the column default). Nothing grants 'editor' today.
-- ---------------------------------------------------------------------------
alter table public.trip_members
  add column if not exists role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  add column if not exists label text,
  add column if not exists email text,
  add column if not exists revoked_at timestamptz;

create index if not exists trip_members_trip_role_idx on public.trip_members (trip_id, role);

-- ---------------------------------------------------------------------------
-- Helpers (security definer, stable). Defined now, used by the cutover migration.
-- ---------------------------------------------------------------------------

-- A Google-backed, non-anonymous session whose verified email is in app_admins.
-- (app_metadata.providers also lists 'google' after an anonymous user links Google.)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and (auth.jwt() -> 'app_metadata' -> 'providers') ? 'google'
     and exists (select 1 from public.app_admins a where a.email = lower(auth.jwt() ->> 'email'));
$$;

-- The caller's role on a trip, or null (no row, or access revoked).
create or replace function public.trip_role(t uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select m.role from public.trip_members m
   where m.trip_id = t and m.user_id = auth.uid() and m.revoked_at is null;
$$;

create or replace function public.can_view(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.trip_role(t) is not null;
$$;

-- Owners count only while their account is still an admin; an editor role (unused today) always counts.
create or replace function public.can_edit(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case public.trip_role(t)
           when 'editor' then true
           when 'owner' then public.is_admin()
           else false
         end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.trip_role(uuid) from public, anon;
revoke all on function public.can_view(uuid) from public, anon;
revoke all on function public.can_edit(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.trip_role(uuid) to authenticated;
grant execute on function public.can_view(uuid) to authenticated;
grant execute on function public.can_edit(uuid) to authenticated;
