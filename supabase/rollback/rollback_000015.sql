-- Rollback for 20261115000015_idea_details.sql. Drops the details and deal_breaker columns (their data is lost).
do $$
declare
  t text;
begin
  foreach t in array array['hotel_ideas', 'food_places', 'attractions', 'stays'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_details_ok');
    execute format('alter table public.%I drop column if exists details', t);
  end loop;

  foreach t in array array['hotel_ideas', 'food_places', 'attractions'] loop
    execute format('alter table public.%I drop column if exists deal_breaker', t);
  end loop;
end $$;
