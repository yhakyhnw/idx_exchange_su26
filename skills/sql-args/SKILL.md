---
name: sql-args
description: "Property search + market analytics with strict user-facing output."
metadata:
  openclaw:
    emoji: "🏡"
    always: true
---

# SQL Args

Use this skill for:

- Week 4 conversational property search over `rets_property`
- Week 5 market analytics over `california_sold`

## Hard rules (must obey, no exceptions)

1. Route market intent first.

- If input contains any market-statistics intent, always use Week 5 flow first.
- Market-statistics intent includes questions about price trends, median price, average DOM, list-to-close ratio, sell volume, number of sales, comps, appreciation/decline, monthly/yearly market changes.
- Market intent is NOT limited to the exact phrase "market stats".
- Do not apply Week 4 city-only follow-up rules to market-intent messages.
- For market-intent with city present, run immediately using TypeScript defaults/overrides.
- For any market-intent query with city present, never ask any follow-up; run now.
- Never ask broad domain clarification questions such as:
  - "real estate, retail, or employment?"
  - "what kind of market stats do you want?"
  - "what timeframe do you want?" (unless city is missing)

1. Never show SQL to user.

- Final response must not contain SQL text.
- Never include `SQL:`, `SQL_1:`, `SQL_2:`, `SELECT`, `RESULTS:`, query text, placeholders, or debug SQL output.

1. City-only input must ask follow-up first.

- Applies to property-search intent only.
- If the user gives only `city`, do not run SQL yet.
- Ask exactly one follow-up for another filter (budget, beds, baths, type, pool, sqft, HOA, view).
- Follow-up questions must be only about supported filters.
- Do not ask multiple questions at once.
- City-only first follow-up must be:
  `What is your max budget?`

1. Return top 5 only after 2+ filters are known.

- Run SQL only when at least 2 explicit filters are known (current message + merged session memory).
- Return max 5 rows.
- If row 6 exists, append exactly:
`there are more than 5 results, would you like to narrow your search down?`

1. Never infer hidden defaults for property search.

- Words like `home`, `buy`, `active`, `listing` are not filters.
- Do not auto-add default filters such as `maxPrice`, `beds`, `baths`, or `pool`.

1. Never ask non-filter follow-up questions.

- Do not ask timeline/lifestyle questions like:
  - "How soon do you want to move?"
  - "Are you pre-approved?"
  - "What neighborhood vibe do you want?"
- These are not supported SQL filters and must never be used as follow-up prompts.
- Renting is not a supported filter for this flow; do not ask "buying or renting?".
- Do not ask "how soon do you need to move?".
- Do not ask "must-haves/non-negotiables" categories that include unsupported criteria.



## Valid property filters

Count only these as explicit filters:

- `city`
- `maxPrice`
- `beds`
- `baths`
- `sqft`
- `type`
- `pool`
- `hasView`
- `maxHoa`

If a field is not explicitly provided by the user (or session memory), treat it as null.

## Field mapping

- `city` -> `L_City`
- `maxPrice` -> `L_SystemPrice <=`
- `beds` -> `L_Keyword2 >=`
- `baths` -> `LM_Dec_3 >=`
- `sqft` -> `LM_Int2_3 >=`
- `type` -> `L_Type_ =`
- `pool` -> `PoolPrivateYN = "True"`
- `hasView` -> `ViewYN = "True"`
- `maxHoa` -> `AssociationFee <=`

Type normalization:

- condo/condominium => `Condominium`
- townhome/townhouse => `Townhouse`
- single family/sfh => `SingleFamilyResidence`
- land => `UnimprovedLand`



## Week 4 conversation behavior

- Keep and merge session context across turns.
- If exactly 1 known filter (including merged session), ask one follow-up and stop.
- If 2+ known filters, run property query and return top 5.
- If >5 rows exist, append:
`there are more than 5 results, would you like to narrow your search down?`
- Follow-up prompts must only request missing supported filters:
  `city`, `maxPrice`, `beds`, `baths`, `sqft`, `type`, `pool`, `hasView`, `maxHoa`.
- Allowed follow-up templates (use one only):
  - `What is your max budget?`
  - `What minimum number of bedrooms do you want?`
  - `What minimum number of bathrooms do you want?`
  - `Do you prefer condo, townhome, or single family?`
  - `Do you want a private pool?`
  - `What minimum square footage do you want?`
  - `What is your maximum HOA fee?`
  - `Do you want a property with a view?`

Example conversation (required behavior):

- User: `Find homes in Irvine`
- Agent: `What is your budget?`
- User: `Under $1.2M`
- Agent: `Any preferences — condo, townhome, or single family?`
- User: `Single family with at least 3 beds`
- Agent: return filtered `rets_property` results (top 5 max, no SQL shown).



## Week 5 market analytics behavior

Market intent keywords include: market, trend, median, DOM, list-to-close, comps, stats, price per sqft.

When market intent is detected:

- If city missing, ask exactly:
`Which California city should I analyze?`
- If city present, run immediately.
- Do not ask any additional clarification before running.
- Do not ask market-domain questions (retail/employment/etc.).
- Do not ask timeframe follow-up when omitted; use code defaults and disclose them in output.

Required market summary metrics:

- Median close price
- Total sell volume
- Number of sales
- Average DOM
- List-to-close ratio
- Trend over selected window (month/year bucket, sales, avg price, avg DOM)

After market summary, append:
`Defaults used: Residential sold comps in <city> over the last 6 months (rentals/leases excluded).`
`If you want different settings, ask again with your preferred window/scope (example: "24-month condo trend in Irvine").`

Default handling and override messaging is implemented in TypeScript code.

## SQL execution (internal only)

Use only SELECT and execute through:
`/bin/zsh -lc 'set -a; [ -f ".env" ] && source ".env"; set +a; mysql --batch --raw --skip-column-names --host="${MYSQL_HOST:-${DB_HOST:-}}" --user="${MYSQL_USER:-${DB_USER:-}}" --password="${MYSQL_PASSWORD:-${DB_PASSWORD:-}}" "${MYSQL_DATABASE:-${DB_NAME:-}}" -e "<SQL>"'`

Property query base (`rets_property`):
`SELECT L_ListingID, L_DisplayId, L_Address, L_City, L_Zip, L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths, LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status, YearBuilt, AssociationFee, DaysOnMarket, PoolPrivateYN, ViewYN, PhotoCount FROM rets_property WHERE L_Status = "Active"`

Property sort/limit behavior:

- `ORDER BY L_SystemPrice ASC LIMIT 6 OFFSET 0`
- Show only first 5 rows to user

Market query constraints (`california_sold` only):

- `PropertyType = "Residential"`
- `PropertyType <> "ResidentialLease"`

Market query 1 (snapshot + median), parameterized by city/months:
`WITH filtered AS (SELECT ClosePrice, DaysOnMarket, ListPrice FROM california_sold WHERE City = "<city>" AND PropertyType = "Residential" AND PropertyType <> "ResidentialLease" AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL <months> MONTH) AND ClosePrice IS NOT NULL), ranked AS (SELECT ClosePrice, DaysOnMarket, ListPrice, ROW_NUMBER() OVER (ORDER BY ClosePrice) AS rn, COUNT(*) OVER () AS cnt FROM filtered) SELECT COUNT(*) AS sold_count, ROUND(AVG(ClosePrice), 0) AS avg_close_price, ROUND(AVG(DaysOnMarket), 1) AS avg_dom, ROUND(AVG(ClosePrice / NULLIF(ListPrice,0)) * 100, 1) AS list_to_close_pct, ROUND(AVG(CASE WHEN rn IN (FLOOR((cnt + 1) / 2), FLOOR((cnt + 2) / 2)) THEN ClosePrice END), 0) AS median_close_price FROM ranked`

Market query 2 (12-month trend), parameterized by city/months:
`SELECT DATE_FORMAT(CloseDate, "%Y-%m") AS month, COUNT(*) AS sales, ROUND(AVG(ClosePrice), 0) AS avg_price, ROUND(AVG(DaysOnMarket), 1) AS avg_dom FROM california_sold WHERE City = "<city>" AND PropertyType = "Residential" AND PropertyType <> "ResidentialLease" AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL <months> MONTH) GROUP BY DATE_FORMAT(CloseDate, "%Y-%m") ORDER BY month`

## User-facing output format

Follow-up case (city-only):

- Ask one concise question only.
- Example: `What is your max budget?`

Results case (2+ filters):

- `Here are the top matches:`
- `1) <Address>, <City> <Zip>`
-    `Price: $<price> | <beds> bd / <baths> ba | <sqft> sqft`
-    `Type: <type> | DOM: <daysOnMarket-or--> | Photos: <photoCount-or-0>`

Market response case:

- `<City> market summary (last <months> months):`
- `- Median close price: $<median>`
- `- Average DOM: <dom> days`
- `- List-to-close ratio: <pct>%`
- `- 12-month trend: <price trend sentence>; <dom trend sentence>.`
- Then up to 12 lines:
`YYYY-MM | sales: <n> | avg price: $<x> | avg DOM: <y>`

No-results case:

- `No results found.`

Error case:

- `SQL_SERVER_ERROR: Unable to connect or execute query on MySQL. Verify server/network/credentials/database.`



## Final validation before send

- Response is user-facing only (no SQL/query text).
- City-only property input does not run SQL.
- Property results only appear when 2+ explicit filters are known.
- Property results are max 5 rows (plus narrowing line when row 6 exists).

