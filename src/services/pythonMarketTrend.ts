import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import type { CityMonthlyTrendWithChangeRow, MarketQueryOptions } from "../types/Week5MarketRows";

const execFileAsync = promisify(execFile);

interface PythonTrendRow {
  month: string;
  sales: number;
  avg_price: number | null;
  avg_dom: number | null;
  price_change_pct: number | null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export async function getPriceTrendFromPython(
  city: string,
  options: MarketQueryOptions,
): Promise<CityMonthlyTrendWithChangeRow[]> {
  const scriptPath = path.resolve(process.cwd(), "data/market_trend.py");
  const args = [
    scriptPath,
    "--city",
    city,
    "--months",
    String(options.months),
    "--property-type",
    options.propertyType,
    "--exclude-leases",
    options.excludeLeases ? "true" : "false",
    "--trend-granularity",
    options.trendGranularity,
  ];

  const { stdout } = await execFileAsync("python3", args, {
    env: process.env,
    maxBuffer: 1024 * 1024,
  });
  const parsed = JSON.parse(stdout) as PythonTrendRow[];
  if (!Array.isArray(parsed)) {
    throw new Error("Python market trend output is not an array");
  }

  return parsed.map((row) => ({
    month: row.month,
    sales: Number(row.sales ?? 0),
    avg_price: toNullableNumber(row.avg_price),
    avg_dom: toNullableNumber(row.avg_dom),
    price_change_pct: toNullableNumber(row.price_change_pct),
  }));
}
