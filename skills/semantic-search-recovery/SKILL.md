---
name: "semantic-search-recovery"
description: "Semantic search fails with ModuleNotFoundError or unknown ORDER BY column: inspect schema, swap in a low-dependency fallback, and rerun end-to-end."
---

# Semantic search recovery
Use when a semantic-search run breaks on missing ML deps or stale SQL schema.

## Steps
1. Read the exact failure.
2. If an import is missing in the scoring path, keep the primary path inside try/except and add a fallback that uses only available libs or stdlib text scoring.
3. If the database query fails on ORDER BY or a column name, inspect the table columns before editing again.
4. Replace the bad sort key with a real column from the schema, or remove the ordering until a valid column is confirmed.
5. Rerun the same end-to-end command.

## Pitfalls
- Do not assume a column exists because older code used it.
- Do not leave a fallback untested after patching it.
- Do not add new heavy dependencies when the environment already lacks them.

## Verify
- The rerun returns ranked listings and the process exits 0.
