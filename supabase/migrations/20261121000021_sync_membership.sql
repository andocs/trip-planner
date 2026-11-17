-- A guest who connects Google after joining keeps the same account, but the invite-time copy of their email and name
-- in trip_members stayed empty (so the owner kept seeing "Guest"). sync_my_membership() refreshes that copy from the
-- account itself: the email from auth.users and the name from the profile or, when linking left the profile empty,
-- from the Google identity. It only ever touches the caller's own rows, never changes a role, and a name the person
-- chose themselves (set_my_label) is kept. The placeholder traveler "Guest" is renamed; any other name is kept.
-- Additive: one function, callable by signed-in users only.

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

revoke all on function public.sync_my_membership() from public, anon;
grant execute on function public.sync_my_membership() to authenticated;
