import { parsePropertyQuery } from "../src/parsePropertyQuery.ts";
import { validateSoldSearchFilters } from "../src/validateSoldSearchFilters.ts";
import { buildSoldCompsQuery, getSoldComps } from "../src/getSoldComps.ts";
import { closePool } from "../src/db.ts";

type SoldSearchFilters = Awaited<ReturnType<typeof parsePropertyQuery>> & {
  closeDateFrom?: string | null;
  closeDateTo?: string | null;
  minYearBuilt?: number | null;
  maxYearBuilt?: number | null;
};

type SoldPipelineSuccess = {
  ok: true;
  query: string;
  filters: SoldSearchFilters;
  sql: string;
  rows: unknown[];
};

type SoldPipelineFailure = {
  ok: false;
  query: string;
  stage: "parse" | "validation" | "execution";
  message: string;
  filters?: SoldSearchFilters;
  sql?: string;
};

export async function parseStep(query: string): Promise<SoldSearchFilters> {
  return parsePropertyQuery(query);
}

export async function validateStep(filters: SoldSearchFilters) {
  return validateSoldSearchFilters(filters);
}

export function buildSqlStep(filters: SoldSearchFilters, months = 12, page = 1, limit = 10): string {
  const { sql } = buildSoldCompsQuery(filters, months, page, limit);
  return sql.replace(/\s+/g, " ").trim();
}

export async function executeSqlStep(
  filters: SoldSearchFilters,
  months = 12,
  page = 1,
  limit = 10,
) {
  return getSoldComps(filters, months, page, limit);
}

export async function runSoldSearchPipeline(
  query: string,
  months = 12,
  page = 1,
  limit = 10,
): Promise<SoldPipelineSuccess | SoldPipelineFailure> {
  const filters = await parseStep(query);

  if (!filters.city) {
    return {
      ok: false,
      query,
      stage: "parse",
      message: "City is required for sold search pipeline.",
      filters,
    };
  }

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

  const sql = buildSqlStep(filters, months, page, limit);
  try {
    const rows = await executeSqlStep(filters, months, page, limit);
    return { ok: true, query, filters, sql, rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sold SQL execution error";
    return { ok: false, query, stage: "execution", message, filters, sql };
  }
}

async function main() {
  try {
    const query = (process.argv[2] ?? "").trim();
    if (!query) {
      console.log(
        "Usage: node --experimental-strip-types tests/soldSearchPipeline.ts \"<query>\" [months] [page] [limit]",
      );
      process.exitCode = 1;
      return;
    }

    const months = Number(process.argv[3] ?? 12);
    const page = Number(process.argv[4] ?? 1);
    const limit = Number(process.argv[5] ?? 10);
    const result = await runSoldSearchPipeline(query, months, page, limit);

    console.log("query:", query);
    if (result.filters) {
      console.log("filters:", JSON.stringify(result.filters, null, 2));
    }

    if (!result.ok) {
      console.log("status: failed");
      console.log("stage:", result.stage);
      console.log("message:", result.message);
      if (result.sql) {
        console.log("sql:", result.sql);
      }
      return;
    }

    console.log("status: success");
    console.log("sql:", result.sql);
    console.log("rowCount:", result.rows.length);
    console.log("rows:", JSON.stringify(result.rows, null, 2));
  } finally {
    await closePool();
  }
}

void main();
