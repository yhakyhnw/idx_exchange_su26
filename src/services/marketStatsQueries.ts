import { query } from "../db/mysql";
import {
  CityClosePriceRow,
  CityMarketSnapshotRow,
  CityMarketSummary,
  CityMarketSummaryRow,
  CityMonthlyTrendRow,
  CityMonthlyTrendWithChangeRow,
  DEFAULT_MARKET_QUERY_OPTIONS,
  MarketQueryOptions,
} from "../types/Week5MarketRows";
import {
  buildCityClosePricesQueryWithOptions,
  buildCityMarketSnapshotQueryWithOptions,
  buildCityMarketSummaryQuery,
  buildCityPriceTrendQueryWithOptions,
} from "./marketStatsQueryBuilders";
import { getPriceTrendFromPython } from "./pythonMarketTrend";

export async function getCityMarketSummary(
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
  limit = 25,
) {
  const { sql, params } = buildCityMarketSummaryQuery(months, limit);
  return query<CityMarketSummaryRow>(sql, params);
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return Math.round((values[mid - 1] + values[mid]) / 2);
  }
  return Math.round(values[mid]);
}

export async function getPriceTrend(
  city: string,
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
): Promise<CityMonthlyTrendWithChangeRow[]> {
  const options: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    months,
  };
  const { sql, params } = buildCityPriceTrendQueryWithOptions(city, options);
  const rows = await query<CityMonthlyTrendRow>(sql, params);

  return mapTrendRowsWithChange(rows);
}

function mapTrendRowsWithChange(rows: CityMonthlyTrendRow[]): CityMonthlyTrendWithChangeRow[] {
  return rows.map((row, index) => {
    if (index === 0 || !rows[index - 1].avg_price || !row.avg_price) {
      return { ...row, price_change_pct: null };
    }
    const previous = rows[index - 1].avg_price;
    const current = row.avg_price;
    const change = ((current - previous) / previous) * 100;
    return { ...row, price_change_pct: Number(change.toFixed(4)) };
  });
}

export async function getCityMarketSummaryByCity(
  city: string,
  options?: Partial<MarketQueryOptions>,
): Promise<CityMarketSummary | null> {
  const resolvedOptions: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    ...options,
  };
  const snapshotQuery = buildCityMarketSnapshotQueryWithOptions(city, resolvedOptions);
  const pricesQuery = buildCityClosePricesQueryWithOptions(city, resolvedOptions);

  const [snapshotRows, closePriceRows, trend] = await Promise.all([
    query<CityMarketSnapshotRow>(snapshotQuery.sql, snapshotQuery.params),
    query<CityClosePriceRow>(pricesQuery.sql, pricesQuery.params),
    (async () => {
      try {
        return await getPriceTrendFromPython(city, resolvedOptions);
      } catch {
        const trendQuery = buildCityPriceTrendQueryWithOptions(city, resolvedOptions);
        const trendRows = await query<CityMonthlyTrendRow>(trendQuery.sql, trendQuery.params);
        return mapTrendRowsWithChange(trendRows);
      }
    })(),
  ]);

  const snapshot = snapshotRows[0];
  if (!snapshot || snapshot.sold_count === 0) {
    return null;
  }

  const closePrices = closePriceRows
    .map((row) => row.ClosePrice)
    .filter((value): value is number => Number.isFinite(value));

  return {
    city,
    options: resolvedOptions,
    soldCount: snapshot.sold_count,
    totalSellVolume: snapshot.total_sell_volume,
    medianClosePrice: computeMedian(closePrices),
    avgDom: snapshot.avg_dom,
    listToClosePct: snapshot.list_to_close_pct,
    trend,
  };
}
