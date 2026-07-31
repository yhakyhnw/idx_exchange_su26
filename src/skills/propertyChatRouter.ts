import type { PropertySearchResult } from "./propertySearchSkill";
import { getSession, updateSession } from "../services/sessionMemory";
import { parsePropertyQuery } from "../parsers/propertyQueryParser";
import type { PropertyFilters } from "../types/PropertyFilters";
import { isMarketStatsIntent, marketStatsSkill, type MarketStatsSkillResult } from "./marketStatsSkill";
import {
  isSemanticSearchIntent,
  semanticSearchSkill,
  type SemanticSearchSkillResult,
} from "./semanticSearchSkill";

export type PropertyChatResponse =
  | { kind: "prompt"; message: string }
  | { kind: "search"; result: PropertySearchResult; message?: string };

export type Week4Week5ChatResponse =
  | PropertyChatResponse
  | { kind: "market"; result: MarketStatsSkillResult }
  | { kind: "semantic"; result: SemanticSearchSkillResult };

const progressivePromptOrder: Array<keyof PropertyFilters> = [
  "type",
  "maxPrice",
  "city",
  "baths",
  "beds",
  "pool",
  "sqft",
  "hasView",
  "maxHoa",
];

const fieldQuestion: Record<keyof PropertyFilters, string> = {
  city: "What city are you interested in?",
  maxPrice: "What is your max budget?",
  beds: "How many bedrooms do you want at minimum?",
  baths: "How many bathrooms do you want at minimum?",
  sqft: "What minimum square footage are you targeting?",
  type: "Do you prefer condo, townhome, single family, or land?",
  pool: "Do you want a private pool?",
  hasView: "Do you want a property with a view?",
  maxHoa: "Do you have a maximum HOA fee?",
};

export function countSpecifiedFilters(filters: PropertyFilters): number {
  return Object.values(filters).filter((value) => value !== null).length;
}

export function mergeFiltersWithSession(
  incoming: PropertyFilters,
  session: ReturnType<typeof getSession>,
): PropertyFilters {
  return {
    city: incoming.city ?? session.city ?? null,
    maxPrice: incoming.maxPrice ?? session.maxPrice ?? null,
    beds: incoming.beds ?? session.beds ?? null,
    baths: incoming.baths ?? session.baths ?? null,
    sqft: incoming.sqft ?? session.sqft ?? null,
    type: incoming.type ?? session.type ?? null,
    pool: incoming.pool ?? (session.pool as "True" | undefined) ?? null,
    hasView: incoming.hasView ?? (session.hasView as "True" | undefined) ?? null,
    maxHoa: incoming.maxHoa ?? session.maxHoa ?? null,
  };
}

function toSessionUpdates(filters: PropertyFilters) {
  return {
    city: filters.city ?? undefined,
    maxPrice: filters.maxPrice ?? undefined,
    beds: filters.beds ?? undefined,
    baths: filters.baths ?? undefined,
    sqft: filters.sqft ?? undefined,
    type: filters.type ?? undefined,
    pool: filters.pool ?? undefined,
    hasView: filters.hasView ?? undefined,
    maxHoa: filters.maxHoa ?? undefined,
  };
}

function pickNextMissingField(filters: PropertyFilters, conversationStep: number) {
  for (let index = 0; index < progressivePromptOrder.length; index += 1) {
    const key = progressivePromptOrder[(conversationStep + index) % progressivePromptOrder.length];
    if (filters[key] === null) {
      return key;
    }
  }
  return null;
}

function buildSearchResult(
  filters: PropertyFilters,
  page: number,
  limit: number,
  listings: any[],
  soldComps: any[],
  activeListingsSql: { sql: string; params: any[] },
  soldCompsSql: { sql: string; params: any[] } | null,
): PropertySearchResult {
  return {
    filters,
    listings,
    soldComps,
    sql: {
      activeListings: activeListingsSql,
      soldComps: soldCompsSql,
    },
    pagination: {
      page,
      limit,
    },
  };
}

export async function handlePropertyChatInput(
  userId: string,
  input: string,
  page = 1,
  limit = 10,
  months = 12,
): Promise<PropertyChatResponse> {
  const parsedFilters = await parsePropertyQuery(input);
  const session = getSession(userId);
  const previousStep = session.conversationStep;
  const mergedFilters = mergeFiltersWithSession(parsedFilters, session);
  const parsedFilterCount = countSpecifiedFilters(parsedFilters);
  const mergedFilterCount = countSpecifiedFilters(mergedFilters);

  // For single-filter user inputs, collect more constraints progressively.
  if (parsedFilterCount <= 1 && mergedFilterCount < 2) {
    updateSession(userId, {
      ...toSessionUpdates(mergedFilters),
      conversationStep: previousStep + 1,
    });

    const missingField = pickNextMissingField(mergedFilters, previousStep);
    return {
      kind: "prompt",
      message: missingField
        ? fieldQuestion[missingField]
        : "Please share one more preference so I can narrow the search.",
    };
  }

  const { searchActiveListings, getSoldComps } = await import("../services/mlsQueries");
  const { buildActiveListingsQuery, buildSoldCompsQuery } = await import(
    "../services/mlsQueryBuilders"
  );
  const fetchLimit = Math.max(6, limit);
  const rawListings = await searchActiveListings(mergedFilters, page, fetchLimit);
  const hasMoreThanFive = rawListings.length > 5;
  const topListings = rawListings.slice(0, 5);
  const soldComps = mergedFilters.city ? await getSoldComps(mergedFilters.city, months) : [];
  const activeListingsSql = buildActiveListingsQuery(mergedFilters, page, fetchLimit);
  const soldCompsSql = mergedFilters.city ? buildSoldCompsQuery(mergedFilters.city, months) : null;
  const result = buildSearchResult(
    mergedFilters,
    page,
    topListings.length,
    topListings,
    soldComps,
    activeListingsSql,
    soldCompsSql,
  );

  updateSession(userId, {
    ...toSessionUpdates(mergedFilters),
    lastResults: topListings,
    conversationStep: previousStep + 1,
  });

  if (parsedFilterCount > 1 && hasMoreThanFive) {
    return {
      kind: "search",
      result,
      message: "there are more than 5 results, would you like to narrow your search down?",
    };
  }

  return { kind: "search", result };
}

export async function handleWeek4Week5ChatInput(
  userId: string,
  input: string,
  page = 1,
  limit = 10,
  months = 12,
): Promise<Week4Week5ChatResponse> {
  if (isMarketStatsIntent(input)) {
    const result = await marketStatsSkill(input);
    return { kind: "market", result };
  }
  if (isSemanticSearchIntent(input)) {
    const result = await semanticSearchSkill(input, { topK: 5 });
    return { kind: "semantic", result };
  }

  return handlePropertyChatInput(userId, input, page, limit, months);
}

export async function handleWhatsAppChatInput(
  userId: string,
  input: string,
  page = 1,
  limit = 10,
  months = 12,
): Promise<Week4Week5ChatResponse> {
  // Single, explicit WhatsApp entrypoint that always applies Week4/5/6 routing.
  return handleWeek4Week5ChatInput(userId, input, page, limit, months);
}
