-- Rollback for 20261130000030_trip_share.sql. Every share link stops working.
drop function if exists public.shared_trip(text);
drop function if exists public.revoke_trip_share(uuid);
drop function if exists public.create_trip_share(uuid);
drop table if exists public.trip_shares;
