---
name: "repository-analytics-source-discovery"
description: "california_sold / DaysOnMarket: find the repo’s analytics entrypoints before probing the database."
---

Use when a request names a market metric or table-like field and the data source is unclear.

1. Search the repo for the metric, table name, and field names first.
2. Inspect the matching analytics module before any DB/library probing.
3. Look for companion validation/arg files that name supported actions and filters.
4. Prefer the narrowest local source that already encodes the query path.
5. Only then decide whether you need environment access, package checks, or a live query.

Pitfalls:
- Broad DB setup checks can waste several turns when the repo already contains the answer path.
- Searching the whole tree with generic tools can stall; narrow to src/ and known query/arg folders first.
- Do not assume missing Python packages mean the data is unavailable.

Verify by confirming both:
- a concrete query/helper file exists for the metric, and
- a validation/args file lists the supported action or field names before executing anything live.
