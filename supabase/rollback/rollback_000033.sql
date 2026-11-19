-- Migration 33 dropped stays_retired for good; its rows cannot be restored from SQL.
-- To get them back, restore the pre-migration-31 backup, or re-enter stays (they are hotel_ideas rows with is_stay = true).
select 1;
