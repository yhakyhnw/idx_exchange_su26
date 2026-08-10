---
name: "debug-local-mysql-searches"
description: "ER_WRONG_ARGUMENTS or node not found when querying local MySQL: load repo .env safely and verify with a direct SELECT."
---

# When to use
Use when a repo task needs local MySQL verification and the app query errors, env vars are missing, or shell-sourcing `.env` breaks the PATH.

# Procedure
1. Check whether the app query and the manual DB path disagree.
2. If the app query fails with `ER_WRONG_ARGUMENTS` / `Incorrect arguments to mysqld_stmt_execute`, compare placeholder count to bound params before changing SQL.
3. Prefer a direct Node verification script over shell sourcing:
   - start Node with `import 'dotenv/config'` or equivalent repo-supported dotenv loading
   - create a `mysql2/promise` pool from `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
   - run the smallest `SELECT` that tests the filter set.
4. If you must source `.env` in a shell, watch for exported `PATH` values; a repo `.env` can shadow `node` and cause `command not found`.
5. Use simple literal filters first (`city`, beds, baths, pool flag) and confirm the column values returned match the request.
6. Only then decide whether the app needs a code fix or the user only needs the query results.

# Pitfalls
- Shell `source .env` can replace `PATH` and hide `node`.
- Prepared-statement errors often mean parameter/count mismatch, not bad data.
- `1.5` baths may return wider matches if the query uses `>=` instead of exact equality.

# Verify
- A direct Node query returns rows from the target table with the expected filters.
- The returned rows show the same city, bed/bath threshold, and pool flag used in the request.
