import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePropertyQuery } from "./parsePropertyQuery.ts";

type AnalyticsAction =
  | "price_trend"
  | "city_snapshot"
  | "avg_median"
  | "price_per_sqft_trend"
  | "list_to_close_ratio_trend"
  | "avg_dom_by_city_month"
  | "inventory_vs_sales"
  | "mom_yoy_comparison";

type PythonAnalyticsResponse = {
  action: AnalyticsAction;
  params: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
};

function extractMonths(query: string): number {
  const lower = query.toLowerCase();
  const yearsMatch = lower.match(/(\d+)\s*year/);
  if (yearsMatch) return Number(yearsMatch[1]) * 12;

  const monthsMatch = lower.match(/(\d+)\s*month/);
  if (monthsMatch) return Number(monthsMatch[1]);

  return 12;
}

function extractLimit(query: string): number {
  const match = query.toLowerCase().match(/top\s+(\d+)/);
  if (!match) return 25;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 50) : 25;
}

function inferGroupBy(query: string): "city" | "zip" | "property_type" {
  const lower = query.toLowerCase();
  if (lower.includes("zip")) return "zip";
  if (lower.includes("property type") || lower.includes("type")) return "property_type";
  return "city";
}

function extractCityFallback(query: string): string | null {
  const match = query.match(/in\s+([A-Za-z\s]+?)(?:\s+over|\s+for|\s+last|\s+by|\?|$)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  return raw
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function inferAction(query: string): AnalyticsAction {
  const lower = query.toLowerCase();

  if (
    lower.includes("inventory") ||
    lower.includes("active count") ||
    lower.includes("active vs sold") ||
    lower.includes("sold volume")
  ) {
    return "inventory_vs_sales";
  }
  if (
    lower.includes("month-over-month") ||
    lower.includes("month over month") ||
    lower.includes("year-over-year") ||
    lower.includes("year over year") ||
    /\bmom\b/.test(lower) ||
    /\byoy\b/.test(lower)
  ) {
    return "mom_yoy_comparison";
  }
  if (
    lower.includes("list-to-close") ||
    lower.includes("list to close") ||
    lower.includes("negotiation leverage")
  ) {
    return "list_to_close_ratio_trend";
  }
  if (
    lower.includes("rising") ||
    lower.includes("falling") ||
    lower.includes("price trend") ||
    lower.includes("prices trend")
  ) {
    return "price_trend";
  }
  if (lower.includes("days on market") || /\bdom\b/.test(lower)) {
    return "avg_dom_by_city_month";
  }
  if (
    lower.includes("price per square foot") ||
    lower.includes("price per sqft") ||
    lower.includes("per sq ft") ||
    lower.includes("ppsf")
  ) {
    return "price_per_sqft_trend";
  }
  if (lower.includes("median") || lower.includes("average close price")) {
    return "avg_median";
  }
  if (lower.includes("trend")) {
    return "price_trend";
  }
  return "city_snapshot";
}

function requiresCity(action: AnalyticsAction): boolean {
  return [
    "price_trend",
    "price_per_sqft_trend",
    "list_to_close_ratio_trend",
    "inventory_vs_sales",
    "mom_yoy_comparison",
  ].includes(action);
}

function formatMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  return Number.isFinite(num) ? `$${Math.round(num).toLocaleString()}` : "N/A";
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : "N/A";
}

function formatPct(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(1)}%` : "N/A";
}

function formatAnalyticsForWhatsapp(response: PythonAnalyticsResponse): string {
  const rows = response.records ?? [];
  if (!rows.length) return "No market analytics data returned for that request.";

  switch (response.action) {
    case "price_trend":
      return [
        `Price trend (${rows.length} months):`,
        ...rows.map(
          (r) =>
            `- ${r.month}: ${formatMoney(r.avg_price)} | sales ${formatNumber(r.sales)} | DOM ${formatNumber(r.avg_dom)} | MoM ${formatPct(r.price_change_pct)}`,
        ),
      ].join("\n");
    case "city_snapshot":
      return [
        `City market snapshot (top ${rows.length}):`,
        ...rows.map(
          (r) =>
            `- ${r.City}: sold ${formatNumber(r.sold_count)} | avg ${formatMoney(r.avg_close_price)} | $/sqft ${formatNumber(r.avg_price_per_sqft)} | DOM ${formatNumber(r.avg_dom)} | list/close ${formatPct(r.list_to_close_pct)}`,
        ),
      ].join("\n");
    case "avg_median":
      return [
        `Average vs median close price (${rows.length} segments):`,
        ...rows.map(
          (r) =>
            `- ${r.segment}: sold ${formatNumber(r.sold_count)} | avg ${formatMoney(r.avg_close_price)} | median ${formatMoney(r.median_close_price)}`,
        ),
      ].join("\n");
    case "price_per_sqft_trend":
      return [
        `Price/sqft trend (${rows.length} months):`,
        ...rows.map(
          (r) =>
            `- ${r.month}: $/sqft ${formatNumber(r.avg_price_per_sqft)} | sales ${formatNumber(r.sales)} | MoM ${formatPct(r.pps_change_pct)}`,
        ),
      ].join("\n");
    case "list_to_close_ratio_trend":
      return [
        `List-to-close trend (${rows.length} months):`,
        ...rows.map(
          (r) =>
            `- ${r.month}: ${formatPct(r.list_to_close_pct)} | sales ${formatNumber(r.sales)} | MoM ${formatPct(r.ratio_change_pct)}`,
        ),
      ].join("\n");
    case "avg_dom_by_city_month":
      return [
        `Avg DOM by city/month (${rows.length} rows):`,
        ...rows.map(
          (r) =>
            `- ${r.City} ${r.month}: DOM ${formatNumber(r.avg_dom)} | sales ${formatNumber(r.sales)}`,
        ),
      ].join("\n");
    case "inventory_vs_sales": {
      const r = rows[0];
      return (
        `Inventory vs sold (${r.city}): ` +
        `active ${formatNumber(r.active_inventory_count)} | sold ${formatNumber(r.sold_volume_count)} | months supply ${formatNumber(r.months_supply_estimate)}`
      );
    }
    case "mom_yoy_comparison":
      return [
        `MoM/YoY comparison (${rows.length} months):`,
        ...rows.map(
          (r) =>
            `- ${r.month_start}: avg ${formatMoney(r.avg_close_price)} | MoM ${formatPct(r.mom_price_pct)} | YoY ${formatPct(r.yoy_price_pct)} | $/sqft ${formatNumber(r.avg_price_per_sqft)}`,
        ),
      ].join("\n");
    default:
      return JSON.stringify(rows);
  }
}

export async function runMarketAnalyticsFromQuery(query: string): Promise<string> {
  const parsed = await parsePropertyQuery(query);
  const action = inferAction(query);
  const months = extractMonths(query);
  const limit = extractLimit(query);
  const groupBy = inferGroupBy(query);
  const city = parsed.city ?? extractCityFallback(query);

  if (requiresCity(action) && !city) {
    return "Please include a city for this market analytics question.";
  }

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const scriptPath = path.join(currentDir, "marketAnalytics.py");

  const args = ["python3", scriptPath, action, "--months", String(months), "--limit", String(limit)];
  if (city) args.push("--city", city);
  if (action === "avg_median") args.push("--group-by", groupBy);

  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    cwd: currentDir,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    return err || "Market analytics query failed.";
  }

  try {
    const parsedJson = JSON.parse((result.stdout || "").trim()) as PythonAnalyticsResponse;
    return formatAnalyticsForWhatsapp(parsedJson);
  } catch {
    return (result.stdout || "").trim() || "No analytics output returned.";
  }
}
