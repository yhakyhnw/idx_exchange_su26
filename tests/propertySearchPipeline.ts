import { parsePropertyQuery } from "../src/parsePropertyQuery.ts";
import { validateSearchFilters } from "../src/validateActiveSearchFilters.ts";
import { buildSearchActiveListingsQuery, searchActiveListings } from "../src/searchActiveListings.ts";
import { closePool } from "../src/db.ts";

type PipelineSuccess = {
  ok: true;
  query: string;
  filters: Awaited<ReturnType<typeof parsePropertyQuery>>;
  sql: string;
  params: unknown[];
  rows: unknown[];
};

type PipelineFailure = {
  ok: false;
  query: string;
  stage: "validation" | "execution";
  message: string;
  filters: Awaited<ReturnType<typeof parsePropertyQuery>>;
  sql?: string;
  params?: unknown[];
};

export async function parseStep(query: string) {
  return parsePropertyQuery(query);
}

export async function validateStep(filters: Awaited<ReturnType<typeof parsePropertyQuery>>) {
  return validateSearchFilters(filters);
}

export function buildSqlStep(
  filters: Awaited<ReturnType<typeof parsePropertyQuery>>,
  page = 1,
  limit = 10,
) {
  return buildSearchActiveListingsQuery(filters, page, limit);
}

export async function executeSqlStep(
  filters: Awaited<ReturnType<typeof parsePropertyQuery>>,
  page = 1,
  limit = 10,
) {
  return searchActiveListings(filters, page, limit);
}

export async function runPropertySearchPipeline(
  query: string,
  page = 1,
  limit = 10,
): Promise<PipelineSuccess | PipelineFailure> {
  const filters = await parseStep(query);
  const validation = await validateStep(filters);

  if (!validation.ok) {
    return {
      ok: false,
      query,
      stage: "validation",
      message: validation.message,
      filters,
    };
  }

  const { sql, params } = buildSqlStep(filters, page, limit);

  try {
    const rows = await executeSqlStep(filters, page, limit);
    return { ok: true, query, filters, sql, params, rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SQL execution error";
    return {
      ok: false,
      query,
      stage: "execution",
      message,
      filters,
      sql,
      params,
    };
  }
}

function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function renderSqlWithParams(sql: string, params: unknown[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = index < params.length ? params[index] : null;
    index += 1;
    return toSqlLiteral(value);
  });
}

async function main() {
  try {
    const query = process.argv.slice(2).join(" ").trim();
    if (!query) {
      console.log("Usage: node --experimental-strip-types tests/propertySearchPipeline.ts \"<query>\"");
      process.exitCode = 1;
      return;
    }

    const result = await runPropertySearchPipeline(query);

    console.log("query:", query);
    console.log("filters:", JSON.stringify(result.filters, null, 2));

    if (!result.ok) {
      console.log("status: failed");
      console.log("stage:", result.stage);
      console.log("message:", result.message);
      if (result.sql) {
        const oneLineSql = result.sql.replace(/\s+/g, " ").trim();
        if (result.params) {
          console.log("sql:", renderSqlWithParams(oneLineSql, result.params));
        }
      }
      if (result.params) {
        console.log("params:", JSON.stringify(result.params));
      }
      return;
    }

    console.log("status: success");
    const oneLineSql = result.sql.replace(/\s+/g, " ").trim();
    console.log("sql:", renderSqlWithParams(oneLineSql, result.params));
    console.log("rowCount:", result.rows.length);
    console.log("rows:", JSON.stringify(result.rows, null, 2));
  } finally {
    await closePool();
  }
}

void main();
