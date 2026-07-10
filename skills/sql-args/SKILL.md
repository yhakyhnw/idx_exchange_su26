---
name: sql-args
description: "Parse MLS property-search messages into structured SQL filter arguments for rets_property."
metadata:
  {
    "openclaw":
      {
        "emoji": "🏡",
        "always": true,
      },
  }
---

# SQL Args

Use this skill when a user asks for MLS search criteria and expects database results.

## Output contract

Return SQL query first, then formatted query results.
No JSON wrappers and no markdown fences.
Use this exact response layout:
`SQL: <single-line SELECT query>`
`RESULTS:`
`<formatted rows>`

## Mapping rules

- `city` -> `L_City`
- `maxPrice` -> `L_SystemPrice` (upper bound)
- `beds` -> `L_Keyword2` (minimum bedrooms)
- `baths` -> `LM_Dec_3` (minimum bathrooms)
- `sqft` -> `LM_Int2_3` (minimum square footage)
- `type` -> `L_Type_`
- `pool` -> `PoolPrivateYN` (use `"True"` when requested, else `null`)
- `hasView` -> `ViewYN` (use `"True"` when requested, else `null`)
- `maxHoa` -> `AssociationFee` (upper bound)

## Type normalization

- `condo` or `condominium` => `"Condominium"`
- `townhome` or `townhouse` => `"Townhouse"`
- `single family` or `sfh` => `"SingleFamilyResidence"`
- `land` => `"UnimprovedLand"`

## Parsing notes

- Parse price inputs like `950k`, `1.5m`, and comma formats like `1,250,000`.
- Use numeric values for all number fields.
- Use `null` for any missing filter.
- Missing filters must be omitted from SQL predicates.

## Which table to query

- If user asks for sold/comps/closed sales/history, query `california_sold`.
- Otherwise query active listings from `rets_property`.

## SQL templates

- Active listings base:
  `SELECT L_ListingID, L_DisplayId, L_Address, L_City, L_Zip, L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths, LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status, LMD_MP_Latitude AS lat, LMD_MP_Longitude AS lng, YearBuilt, AssociationFee, DaysOnMarket, PoolPrivateYN, ViewYN, FireplaceYN, PhotoCount, LA1_UserFirstName, LA1_UserLastName, LO1_OrganizationName FROM rets_property WHERE L_Status = "Active"`
- Sold comps base:
  `SELECT ListingKey, UnparsedAddress, City, CloseDate, ClosePrice, OriginalListPrice, ListPrice, DaysOnMarket, BedroomsTotal, BathroomsTotalInteger, LivingArea, PropertyType, PropertySubType, YearBuilt, ListAgentFullName, ListOfficeName, BuyerOfficeName FROM california_sold WHERE PropertyType = "Residential"`
- For sold queries with a city, append `AND City = "<city>"`.
- For sold queries with time window, append `AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL <months> MONTH)` (default months = 12).
- End active query with `ORDER BY L_SystemPrice ASC LIMIT 10 OFFSET 0`.
- End sold query with `ORDER BY CloseDate DESC LIMIT 50`.

## Execute against MySQL (required)

After building SQL, execute it with the bash tool using this exact pattern:
`/bin/zsh -lc 'set -a; [ -f "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/.env" ] && source "/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/.env"; set +a; /opt/anaconda3/bin/mysql --batch --raw --skip-column-names --host="${MYSQL_HOST:-${DB_HOST:-}}" --user="${MYSQL_USER:-${DB_USER:-}}" --password="${MYSQL_PASSWORD:-${DB_PASSWORD:-}}" "${MYSQL_DATABASE:-${DB_NAME:-}}" -e "<SQL>"'`

Rules:
- Only execute one `SELECT` statement.
- Never execute non-SELECT SQL.
- Use SQL string values directly (for example `AND L_City = "Anaheim"`), not `?`.
- Convert command stdout rows into pretty output:
  - single-row response: `Address: <value>` and `Price: $<value with commas>` when those fields exist
  - multi-row response: numbered entries (`1) ...`, `2) ...`) with key fields (address, city, price, beds/baths, close date as applicable)
  - if no rows: return exactly `No results found.`
- Always include the SQL line before results: `SQL: <query>`.
- Always source `/Users/andrewkim/Desktop/4_Internship/idx_exchange_su26/.env` before executing mysql.
- Failsafe: if mysql execution returns any non-zero exit code, return this exact one-line error:
  `SQL_SERVER_ERROR: Unable to connect or execute query on MySQL. Verify server/network/credentials/database.`
- Do not return an empty response. On failure, always return the failsafe error line above.

## Final self-check (required)

Before sending the final answer, verify:
- Output is formatted and human-readable (not raw tab-separated output)
- First line starts with `SQL: SELECT`
- A `RESULTS:` line appears after the SQL line
- Output is from a `SELECT` query only
- If query execution failed, output is exactly the `SQL_SERVER_ERROR: ...` line

If any check fails, regenerate and send only MySQL output rows.
