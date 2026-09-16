PaceFetch odds/markets upgrade — safe v1

Files:
- api/predictions.js
- api/prediction-engine.js
- js/app.js
- supabase_odds_migration.sql

Important:
1. This version preserves API_FOOTBALL_KEY.
2. It adds API-Football pre-match odds retrieval.
3. It does NOT invent probabilities for BTTS, Over 1.5 or Over 2.5.
   API-Football's predictions endpoint currently gives percentage probabilities
   for Home/Draw/Away, while its under_over field is a label rather than a
   percentage. Those other markets therefore need an independent probability
   model before PaceFetch can truthfully publish them as model probabilities.
4. Odds are displayed separately and can include implied probability and
   model-vs-market edge.
5. PACEFETCH_BOOKMAKER_ID is optional. If omitted, the first available
   bookmaker in the API response is used.
6. On API-Football Free, 100 requests/day means the current 20-fixture cap
   should not be increased. This upgrade can use up to 1 fixture call + 20
   prediction calls + 20 odds calls = 41 calls for one generation run,
   before any other API usage.
