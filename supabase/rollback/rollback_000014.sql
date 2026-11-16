-- Undo 20261114000014_text_search_atmosphere.sql. Removes the cap row and its usage counts (the app must be rolled
-- back to the previous search SKU first, or searches fail closed).
delete from public.api_usage where sku = 'text_search_atmosphere';
delete from public.api_caps where sku = 'text_search_atmosphere';
