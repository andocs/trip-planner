-- Broadcast row changes so every phone on the trip stays in sync.
-- Realtime applies RLS, so subscribers only receive rows for trips they belong to.

alter publication supabase_realtime add table
  public.trips,
  public.trip_members,
  public.travelers,
  public.destinations,
  public.categories,
  public.expenses,
  public.itinerary_items,
  public.flights,
  public.transfers,
  public.stays,
  public.hotel_ideas,
  public.food_places,
  public.menu_items,
  public.attractions,
  public.packing_items,
  public.gifts,
  public.reminders;
