import {
  DEFAULT_MARKET_QUERY_OPTIONS,
  type CityMarketSummary,
  type MarketQueryOptions,
  type TrendGranularity,
} from "../types/Week5MarketRows";

export interface MarketStatsSkillResult {
  city: string | null;
  options: MarketQueryOptions;
  defaultsApplied: string[];
  summary: string;
  data: CityMarketSummary | null;
}

const MARKET_INTENT_PATTERN =
  /\b(market|stats?|statistics|trend|trends|median|dom|days on market|list[-\s]?to[-\s]?close|volume|sales|sold|comps?|appreciation|decline|price(?:s)?\s+(?:trend|change|changes)?)\b/i;
const CITY_STOPWORDS = new Set([
  "need",
  "show",
  "give",
  "want",
  "what",
  "tell",
  "compare",
  "analysis",
  "analyze",
  "market",
  "stats",
  "stat",
  "trend",
]);

export function isMarketStatsIntent(question: string): boolean {
  return MARKET_INTENT_PATTERN.test(question);
}

function parseMonthsFromQuestion(question: string): number {
  if (/\b(last|past)\s+year\b/i.test(question) || /\byearly\b/i.test(question)) {
    return 12;
  }
  const yearMatch = question.match(/(\d+)\s*year/i);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (Number.isFinite(years) && years > 0) {
      return Math.min(60, Math.floor(years * 12));
    }
  }
  const match = question.match(/(\d+)\s*month/i);
  if (!match) {
    return DEFAULT_MARKET_QUERY_OPTIONS.months;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MARKET_QUERY_OPTIONS.months;
  }
  return Math.min(36, Math.floor(parsed));
}

export function parseCityFromMarketQuestion(question: string): string | null {
  const patterns = [
    /(?:in|for|around)\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+(?:over|for|during|last|past|with|and|including|include|excluding|exclude|market|stats?|trend|median|dom|volume|sales|sold|comps?)\b|[?.!,]|$)/i,
    /([A-Za-z][A-Za-z\s'-]+?)\s+(?:market|stats?|statistics|trend|trends|median|dom|volume|sales|sold|comps?)\b/i,
    /(?:city of)\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s|[?.!,]|$)/i,
  ] as const;

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (!match) {
      continue;
    }
    const city = match[1].trim().replace(/\s+/g, " ");
    if (!city) {
      continue;
    }
    const firstToken = city.split(" ")[0].toLowerCase();
    if (CITY_STOPWORDS.has(firstToken)) {
      continue;
    }
    return city
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }
  return null;
}

function parseTrendGranularity(question: string): TrendGranularity {
  if (/yearly|year-over-year|annual|annually/i.test(question)) {
    return "yearly";
  }
  return "monthly";
}

function parsePropertyType(question: string): string {
  if (/residential\s*lease|\blease(s)?\b market|\brental(s)?\b market/i.test(question)) {
    return "ResidentialLease";
  }
  if (/\bland\b/i.test(question)) {
    return "Land";
  }
  if (/commercial/i.test(question)) {
    return "CommercialSale";
  }
  return "Residential";
}

function parseExcludeLeases(question: string): boolean {
  if (/includ(?:e|ing)\s+leases?|includ(?:e|ing)\s+rentals?/i.test(question)) {
    return false;
  }
  if (/exclud(?:e|ing)\s+leases?|exclud(?:e|ing)\s+rentals?/i.test(question)) {
    return true;
  }
  return true;
}

function parseMarketOptions(question: string): { options: MarketQueryOptions; defaultsApplied: string[] } {
  const options: MarketQueryOptions = {
    ...DEFAULT_MARKET_QUERY_OPTIONS,
    months: parseMonthsFromQuestion(question),
    propertyType: parsePropertyType(question),
    excludeLeases: parseExcludeLeases(question),
    trendGranularity: parseTrendGranularity(question),
  };

  const defaultsApplied: string[] = [];
  if (!/(\d+)\s*month|(\d+)\s*year|\b(last|past)\s+year\b|\byearly\b/i.test(question)) {
    defaultsApplied.push(`months=${DEFAULT_MARKET_QUERY_OPTIONS.months}`);
  }
  if (!/residential|lease|rental|land|commercial/i.test(question)) {
    defaultsApplied.push("propertyType=Residential");
  }
  if (
    !/includ(?:e|ing)\s+leases?|includ(?:e|ing)\s+rentals?|exclud(?:e|ing)\s+leases?|exclud(?:e|ing)\s+rentals?/i.test(
      question,
    )
  ) {
    defaultsApplied.push("excludeLeases=true");
  }
  if (!/yearly|year-over-year|annual|annually|monthly|month-by-month/i.test(question)) {
    defaultsApplied.push("trendGranularity=monthly");
  }

  return { options, defaultsApplied };
}

function isSellVolumeOnlyQuestion(question: string): boolean {
  return /(?:only\s+)?sell\s+volume|volume\s+only/i.test(question);
}

function formatCurrency(value: number | null): string {
  if (!Number.isFinite(value as number)) {
    return "-";
  }
  return `$${Math.round(value as number).toLocaleString()}`;
}

function trendDirection(first: number | null, last: number | null, noun: string): string {
  if (!Number.isFinite(first as number) || !Number.isFinite(last as number) || first === 0) {
    return `${noun} trend is inconclusive`;
  }
  const delta = (((last as number) - (first as number)) / (first as number)) * 100;
  if (Math.abs(delta) < 0.5) {
    return `${noun} is flat`;
  }
  const direction = delta > 0 ? "up" : "down";
  return `${noun} is ${direction} ${Math.abs(delta).toFixed(1)}%`;
}

function buildSummary(data: CityMarketSummary): string {
  const firstTrend = data.trend[0];
  const lastTrend = data.trend[data.trend.length - 1];
  const priceTrend = trendDirection(firstTrend?.avg_price ?? null, lastTrend?.avg_price ?? null, "price");
  const domTrend = trendDirection(firstTrend?.avg_dom ?? null, lastTrend?.avg_dom ?? null, "DOM");
  const months = data.options.months;

  return [
    `${data.city} market summary (last ${months} months):`,
    `- Median close price: ${formatCurrency(data.medianClosePrice)}`,
    `- Total sell volume: ${formatCurrency(data.totalSellVolume)}`,
    `- Number of sales: ${data.soldCount}`,
    `- Average DOM: ${data.avgDom ?? "-"} days`,
    `- List-to-close ratio: ${data.listToClosePct ?? "-"}%`,
    `- Trend: ${priceTrend}; ${domTrend}.`,
  ].join("\n");
}

function buildSellVolumeOnlySummary(data: CityMarketSummary): string {
  return [
    `${data.city} sell volume summary (last ${data.options.months} months):`,
    `- Total sell volume: ${formatCurrency(data.totalSellVolume)}`,
    `- Number of sales: ${data.soldCount}`,
  ].join("\n");
}

export async function marketStatsSkill(question: string): Promise<MarketStatsSkillResult> {
  const city = parseCityFromMarketQuestion(question);
  const { options, defaultsApplied } = parseMarketOptions(question);
  const volumeOnly = isSellVolumeOnlyQuestion(question);

  if (!city) {
    return {
      city: null,
      options,
      defaultsApplied,
      data: null,
      summary: "Please specify a California city for market stats (for example: 'market stats in San Diego').",
    };
  }

  const { getCityMarketSummaryByCity } = await import("../services/marketStatsQueries");
  const data = await getCityMarketSummaryByCity(city, options);
  if (!data) {
    return {
      city,
      options,
      defaultsApplied,
      data: null,
      summary: `No sold-market data found for ${city} in the last ${options.months} months.`,
    };
  }

  const defaultsLine = defaultsApplied.length
    ? `Defaults used: ${defaultsApplied.join(", ")}.`
    : "Defaults used: none.";
  const overrideLine =
    "You can update defaults by specifying: months, property type, include/exclude leases, and trend granularity.";

  return {
    city,
    options,
    defaultsApplied,
    data,
    summary: `${volumeOnly ? buildSellVolumeOnlySummary(data) : buildSummary(data)}\n${defaultsLine}\n${overrideLine}`,
  };
}
