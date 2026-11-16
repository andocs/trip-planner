-- Discover cards now show Google's short description (editorialSummary). That field puts the Text Search call in the
-- Enterprise+Atmosphere tier, which Google meters as its own SKU (1,000 free a month), so it needs its own cap row.
-- Additive and safe to run more than once. The old text_search_enterprise row is left in place, unused.
-- Rollback: supabase/rollback/rollback_000014.sql.
insert into public.api_caps (sku, monthly_cap, free_allowance) values
  ('text_search_atmosphere', 800, 1000)  -- Text Search with rating, hours and description: one call returns about 20 cards
on conflict (sku) do nothing;
