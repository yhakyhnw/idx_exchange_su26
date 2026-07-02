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

Use this skill when a user asks for property search criteria that should map to SQL filters.

Only support the 9 filters listed below for now. Ignore all other criteria.

## Output contract

Return only a JSON object with this exact shape:

```json
{
  "city": null,
  "maxPrice": null,
  "beds": null,
  "baths": null,
  "sqft": null,
  "type": null,
  "pool": null,
  "hasView": null,
  "maxHoa": null
}
```

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

Any criteria outside these 9 fields (for example garage spaces, school district, fireplace, lot size,
new construction, neighborhood names, or listing age) must be ignored for now.

## Type normalization

- `condo` or `condominium` => `"Condominium"`
- `townhome` or `townhouse` => `"Townhouse"`
- `single family` or `sfh` => `"SingleFamilyResidence"`
- `land` => `"UnimprovedLand"`

## Parsing notes

- Parse price inputs like `950k`, `1.5m`, and comma formats like `1,250,000`.
- Use numeric values for all number fields.
- Use `null` for any missing filter.
- Return no explanation text, no markdown, and no code fences.
