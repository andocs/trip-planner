-- Rollback for 20261116000016_itinerary_order_connectors.sql.
-- Connector rows (kind <> 'stop') are deleted first, because without `kind` they would turn into fake stops.
-- The saved order (position) is dropped with the column; items fall back to time order.
delete from public.itinerary_items where kind <> 'stop';
drop index if exists public.itinerary_items_order_idx;
alter table public.itinerary_items drop constraint if exists itinerary_items_position_ok;
alter table public.itinerary_items drop constraint if exists itinerary_items_details_ok;
alter table public.itinerary_items drop constraint if exists itinerary_items_kind_ok;
alter table public.itinerary_items
  drop column if exists position,
  drop column if exists kind,
  drop column if exists details;
