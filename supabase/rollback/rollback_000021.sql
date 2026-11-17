-- Rollback for 20261121000021_sync_membership.sql. Emails and names already copied stay (they are ordinary values).
drop function if exists public.sync_my_membership();
