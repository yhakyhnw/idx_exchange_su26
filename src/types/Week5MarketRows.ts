export interface CityMarketSummaryRow {
  City: string;
  sold_count: number;
  total_sell_volume: number | null;
  avg_close_price: number | null;
  avg_price_per_sqft: number | null;
  avg_dom: number | null;
  list_to_close_pct: number | null;
}

export type TrendGranularity = "monthly" | "yearly";

export interface MarketQueryOptions {
  months: number;
  propertyType: string;
  excludeLeases: boolean;
  trendGranularity: TrendGranularity;
  resultScope: "city-level";
}

export const DEFAULT_MARKET_QUERY_OPTIONS: MarketQueryOptions = {
  months: 6,
  propertyType: "Residential",
  excludeLeases: true,
  trendGranularity: "monthly",
  resultScope: "city-level",
};

export interface CityMarketSnapshotRow {
  sold_count: number;
  total_sell_volume: number | null;
  avg_close_price: number | null;
  avg_dom: number | null;
  list_to_close_pct: number | null;
}

export interface CityClosePriceRow {
  ClosePrice: number;
}

export interface CityMonthlyTrendRow {
  month: string;
  sales: number;
  avg_price: number | null;
  avg_dom: number | null;
}

export interface CityMonthlyTrendWithChangeRow extends CityMonthlyTrendRow {
  price_change_pct: number | null;
}

export interface CityMarketSummary {
  city: string;
  options: MarketQueryOptions;
  soldCount: number;
  totalSellVolume: number | null;
  medianClosePrice: number | null;
  avgDom: number | null;
  listToClosePct: number | null;
  trend: CityMonthlyTrendWithChangeRow[];
}
