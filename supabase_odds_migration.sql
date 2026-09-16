-- PaceFetch odds fields
-- Run this ONLY against the existing predictions table if these columns do not exist.
-- Adjust the table name if your existing Supabase table uses another name.

alter table public.predictions
  add column if not exists odds numeric(10,3),
  add column if not exists implied_probability numeric(5,2),
  add column if not exists edge numeric(6,2),
  add column if not exists bookmaker text,
  add column if not exists bookmaker_id integer,
  add column if not exists odds_available boolean default false;

create index if not exists predictions_fixture_id_idx
  on public.predictions (fixture_id);

create index if not exists predictions_market_idx
  on public.predictions (market);

create index if not exists predictions_date_idx
  on public.predictions (date);
