import { BuiltQuery } from "./mlsQueryBuilders";
import { DEFAULT_MARKET_QUERY_OPTIONS, MarketQueryOptions } from "../types/Week5MarketRows";

export function buildCityMarketSummaryQuery(
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
  limit = 25,
): BuiltQuery {
  const sql = `
SELECT
City,
COUNT(*) AS sold_count,
ROUND(SUM(ClosePrice), 0) AS total_sell_volume,
ROUND(AVG(ClosePrice), 0) AS avg_close_price,
ROUND(AVG(ClosePrice / NULLIF(LivingArea,0)),0) AS avg_price_per_sqft,
ROUND(AVG(DaysOnMarket), 1) AS avg_dom,
ROUND(AVG(ClosePrice / NULLIF(ListPrice,0)) * 100, 1) AS list_to_close_pct
FROM california_sold
WHERE PropertyType = 'Residential'
AND PropertyType <> 'ResidentialLease'
AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
AND LivingArea > 0
GROUP BY City
ORDER BY sold_count DESC
LIMIT ?
`;
  return { sql, params: [months, limit] };
}

export function buildCityPriceTrendQuery(
  city: string,
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
): BuiltQuery {
  const options: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    months,
  };
  return buildCityPriceTrendQueryWithOptions(city, options);
}

function buildMarketWhereClause(city: string, options: MarketQueryOptions) {
  let where = `
WHERE City = ?
AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
`;
  const params: Array<string | number> = [city, options.months];

  // "include rentals" means include both Residential and ResidentialLease rows.
  if (options.propertyType === "Residential" && !options.excludeLeases) {
    where += "AND PropertyType IN ('Residential', 'ResidentialLease')\n";
  } else if (options.propertyType) {
    where += "AND PropertyType = ?\n";
    params.push(options.propertyType);
  }
  if (options.excludeLeases) {
    where += "AND PropertyType <> 'ResidentialLease'\n";
  }
  return { where, params };
}

export function buildCityPriceTrendQueryWithOptions(
  city: string,
  options: MarketQueryOptions,
): BuiltQuery {
  const dateFormat = options.trendGranularity === "yearly" ? "%Y" : "%Y-%m";
  const sql = `
SELECT
DATE_FORMAT(CloseDate, "${dateFormat}") AS month,
COUNT(*) AS sales,
ROUND(AVG(ClosePrice), 0) AS avg_price,
ROUND(AVG(DaysOnMarket), 1) AS avg_dom
FROM california_sold
${buildMarketWhereClause(city, options).where}
GROUP BY DATE_FORMAT(CloseDate, "${dateFormat}")
ORDER BY month
`;
  const { params } = buildMarketWhereClause(city, options);
  return { sql, params };
}

export function buildCityMarketSnapshotQuery(
  city: string,
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
): BuiltQuery {
  const options: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    months,
  };
  return buildCityMarketSnapshotQueryWithOptions(city, options);
}

export function buildCityMarketSnapshotQueryWithOptions(
  city: string,
  options: MarketQueryOptions,
): BuiltQuery {
  const sql = `
SELECT
COUNT(*) AS sold_count,
ROUND(SUM(ClosePrice), 0) AS total_sell_volume,
ROUND(AVG(ClosePrice), 0) AS avg_close_price,
ROUND(AVG(DaysOnMarket), 1) AS avg_dom,
ROUND(AVG(ClosePrice / NULLIF(ListPrice,0)) * 100, 1) AS list_to_close_pct
FROM california_sold
${buildMarketWhereClause(city, options).where}
`;
  const { params } = buildMarketWhereClause(city, options);
  return { sql, params };
}

export function buildCityClosePricesQuery(
  city: string,
  months = DEFAULT_MARKET_QUERY_OPTIONS.months,
): BuiltQuery {
  const options: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    months,
  };
  return buildCityClosePricesQueryWithOptions(city, options);
}

export function buildCityClosePricesQueryWithOptions(
  city: string,
  options: MarketQueryOptions,
): BuiltQuery {
  const sql = `
SELECT ClosePrice
FROM california_sold
${buildMarketWhereClause(city, options).where}
AND ClosePrice IS NOT NULL
ORDER BY ClosePrice ASC
`;
  const { params } = buildMarketWhereClause(city, options);
  return { sql, params };
}
