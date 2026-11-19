-- Drops the old stays table that migration 31 renamed to stays_retired and locked (nothing in the app has read it since).
-- Stays now live in hotel_ideas (is_stay). This cannot be undone: the rows are gone with the table, so keep the backup
-- taken before migration 31 until you are sure. Idempotent.
drop table if exists public.stays_retired;
