import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCityClosePricesQuery,
  buildCityMarketSnapshotQuery,
  buildCityMarketSummaryQuery,
  buildCityPriceTrendQuery,
} from "../src/services/marketStatsQueryBuilders";
import { parseCityFromMarketQuestion } from "../src/skills/marketStatsSkill";

const shouldRunStatsCli = process.argv.includes("--run-stats");
const DEFAULT_WEEK5_QUERIES = [
  "Market stats in Irvine",
  "Median price and DOM trend in San Diego over the last 12 months",
  "Only sell volume in Anaheim over the last year",
  "24 month condo market trend in Pasadena",
  "Yearly market stats in Santa Monica including rentals",
  "Market stats in Newport Beach over the last 3 months",
  "Market stats in Los Angeles over the last 18 months",
  "Only sell volume in San Jose over the last 6 months",
  "Yearly market stats in Sacramento excluding rentals",
  "36 month market trend in Riverside",
];

async function runStatsCli() {
  const queryParts = process.argv.filter((arg) => arg !== "--run-stats").slice(2);
  const queries = queryParts.length > 0 ? [queryParts.join(" ")] : DEFAULT_WEEK5_QUERIES;

  try {
    const { marketStatsSkill } = await import("../src/skills/marketStatsSkill");
    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      const result = await marketStatsSkill(query);
      console.log(`\n=== QUERY ${index + 1} ===`);
      console.log(query);
      console.log("--- RESULT ---");
      console.log(result.summary);

      if (!result.data) {
        continue;
      }

      console.log(
        JSON.stringify(
          {
            query,
            city: result.data.city,
            months: result.data.options.months,
            propertyType: result.data.options.propertyType,
            excludeLeases: result.data.options.excludeLeases,
            trendGranularity: result.data.options.trendGranularity,
            medianClosePrice: result.data.medianClosePrice,
            totalSellVolume: result.data.totalSellVolume,
            soldCount: result.data.soldCount,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`RUN_STATS_ERROR: ${message}`);
    process.exitCode = 1;
  }
}

if (shouldRunStatsCli) {
  void runStatsCli();
} else {
  test("buildCityMarketSummaryQuery is parameterized and bounded", () => {
    const { sql, params } = buildCityMarketSummaryQuery(12, 25);
    assert.ok(sql.includes("INTERVAL ? MONTH"));
    assert.ok(sql.includes("LIMIT ?"));
    assert.equal(sql.includes("12"), false);
    assert.deepEqual(params, [12, 25]);
  });

  test("buildCityMarketSnapshotQuery is parameterized by city and months", () => {
    const { sql, params } = buildCityMarketSnapshotQuery("Irvine", 12);
    assert.ok(sql.includes("City = ?"));
    assert.ok(sql.includes("INTERVAL ? MONTH"));
    assert.ok(sql.includes("SUM(ClosePrice)"));
    assert.deepEqual(params, ["Irvine", 12, "Residential"]);
  });

  test("buildCityClosePricesQuery orders prices for median calculation", () => {
    const { sql, params } = buildCityClosePricesQuery("Pasadena", 12);
    assert.ok(sql.includes("ORDER BY ClosePrice ASC"));
    assert.deepEqual(params, ["Pasadena", 12, "Residential"]);
  });

  test("buildCityPriceTrendQuery includes monthly grouping", () => {
    const { sql, params } = buildCityPriceTrendQuery("San Diego", 12);
    assert.ok(sql.includes('DATE_FORMAT(CloseDate, "%Y-%m") AS month'));
    assert.ok(sql.includes('GROUP BY DATE_FORMAT(CloseDate, "%Y-%m")'));
    assert.deepEqual(params, ["San Diego", 12, "Residential"]);
  });

  test("parseCityFromMarketQuestion extracts city", () => {
    assert.equal(parseCityFromMarketQuestion("What is the market like in irvine?"), "Irvine");
    assert.equal(parseCityFromMarketQuestion("Show trend for SAN DIEGO over 12 months"), "San Diego");
    assert.equal(parseCityFromMarketQuestion("Need market stats"), null);
  });
}
