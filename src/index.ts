import { parsePropertyQuery } from "./parsePropertyQuery.ts";
import { validateSearchFilters } from "./validateActiveSearchFilters.ts";
import { formatActiveListingsForWhatsapp, searchActiveListings } from "./searchActiveListings.ts";
import { closePool } from "./db.ts";
import { validateSoldSearchFilters } from "./validateSoldSearchFilters.ts";
import { formatSoldListingsForWhatsapp, getSoldComps } from "./getSoldComps.ts";
import { runMarketAnalyticsFromQuery } from "./marketAnalyticsBridge.ts";
import { runSemanticSearchFromQuery } from "./semanticSearchBridge.ts";
import { runHybridRecommendationFromAddress } from "./recommendationBridge.ts";
import { runRagKnowledgeFromQuery } from "./ragKnowledgeBridge.ts";
import { pathToFileURL } from "node:url";
import {
  buildNarrowingPrompt,
  countCoreActiveArgs,
  getSession,
  mergeSessionWithParsedFilters,
  updateSession,
} from "./chatbotScript.ts";
import type { SoldSearchFilters } from "./getSoldComps.ts";

type RequestPayload = {
  action: string;
  payload?: Record<string, unknown>;
};

export type OrchestratorIntent =
  | "search"
  | "market"
  | "recommend"
  | "knowledge"
  | "email"
  | "mixed";

type IntentFlags = {
  isSearch: boolean;
  isMarket: boolean;
  isRecommend: boolean;
  isKnowledge: boolean;
  isEmail: boolean;
};

export function detectIntentFlags(query: string): IntentFlags {
  const q = query.toLowerCase();
  return {
    isSearch: /\b(find|show|list|homes?|houses?|condos?|properties|listings?)\b/.test(q),
    isMarket:
      /\b(market|trend|rising|falling|price|prices|dom|days on market|inventory|list-to-close|list to close)\b/.test(
        q,
      ),
    isRecommend: /\b(similar|recommend|comparable|comps)\b/.test(q),
    isKnowledge: /\b(what is|what does|define|meaning|column|field|explain)\b/.test(q),
    isEmail: /\b(email|draft|summary|send)\b/.test(q),
  };
}

export function extractSearchQueryForMixed(query: string): string {
  const lower = query.toLowerCase();
  const splitCandidates = [" and tell me ", " and whether ", " and also ", " plus "];
  for (const token of splitCandidates) {
    const idx = lower.indexOf(token);
    if (idx > 0) return query.slice(0, idx).trim();
  }
  return query;
}

async function classifyIntent(query: string): Promise<OrchestratorIntent> {
  const flags = detectIntentFlags(query);
  const hitCount = [
    flags.isSearch,
    flags.isMarket,
    flags.isRecommend,
    flags.isKnowledge,
    flags.isEmail,
  ].filter(Boolean).length;

  if (hitCount > 1) return "mixed";
  if (flags.isEmail) return "email";
  if (flags.isRecommend) return "recommend";
  if (flags.isKnowledge) return "knowledge";
  if (flags.isMarket) return "market";
  return "search";
}

async function propertySearchAgent(query: string, userId: string): Promise<unknown> {
  return await runAction({
    action: "search_active_properties",
    payload: { query, userId },
  });
}

async function marketStatsAgent(query: string): Promise<unknown> {
  return await runMarketAnalyticsFromQuery(query);
}

async function recommendationAgent(lastResult: unknown): Promise<unknown> {
  const row = lastResult as Record<string, unknown> | undefined;
  const address = typeof row?.L_Address === "string" ? row.L_Address : "";
  if (!address) return "No prior listing found to recommend against.";
  return await runHybridRecommendationFromAddress(address);
}

async function ragAgent(query: string): Promise<unknown> {
  return await runRagKnowledgeFromQuery(query);
}

async function emailDraftAgent(): Promise<unknown> {
  return "WIP";
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function capToMaxLines(text: string, maxLines = 10): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text;
  if (maxLines <= 1) return "...";
  return [...lines.slice(0, maxLines - 1), "..."].join("\n");
}

function formatCombinedResponse(sections: Array<{ label: string; value: unknown }>): string {
  const output: string[] = [];
  for (const section of sections) {
    output.push(`${section.label}:\n${capToMaxLines(toText(section.value), 10)}`);
  }
  return output.join("\n\n---\n\n");
}

export async function orchestrate(query: string, userId: string) {
  const intent = await classifyIntent(query);
  switch (intent) {
    case "search":
      return formatCombinedResponse([
        { label: "Reply from Property Search Agent", value: await propertySearchAgent(query, userId) },
      ]);
    case "market":
      return formatCombinedResponse([
        { label: "Reply from Market Stats Agent", value: await marketStatsAgent(query) },
      ]);
    case "recommend": {
      const session = getSession(userId);
      return formatCombinedResponse([
        { label: "Reply from Recommendation Agent", value: await recommendationAgent(session.lastResults?.[0]) },
      ]);
    }
    case "knowledge":
      return formatCombinedResponse([
        { label: "Reply from RAG Agent", value: await ragAgent(query) },
      ]);
    case "email":
      return formatCombinedResponse([
        { label: "Reply from Email Draft Agent", value: await emailDraftAgent() },
      ]);
    case "mixed": {
      const flags = detectIntentFlags(query);
      const sections: Array<{ label: string; value: unknown }> = [];
      const searchQuery = extractSearchQueryForMixed(query);

      let listingsResult: unknown = null;
      if (flags.isSearch) {
        listingsResult = await propertySearchAgent(searchQuery, userId);
        sections.push({ label: "Reply from Property Search Agent", value: listingsResult });
      }

      const parallelTasks: Array<Promise<unknown>> = [];
      const parallelLabels: string[] = [];
      if (flags.isMarket) {
        parallelTasks.push(marketStatsAgent(query));
        parallelLabels.push("Reply from Market Stats Agent");
      }
      if (flags.isKnowledge) {
        parallelTasks.push(ragAgent(query));
        parallelLabels.push("Reply from RAG Agent");
      }
      if (flags.isEmail) {
        parallelTasks.push(emailDraftAgent());
        parallelLabels.push("Reply from Email Draft Agent");
      }
      const parallelResults = await Promise.all(parallelTasks);
      for (let i = 0; i < parallelResults.length; i += 1) {
        sections.push({ label: parallelLabels[i], value: parallelResults[i] });
      }

      if (flags.isRecommend) {
        let recommendSource = getSession(userId).lastResults?.[0];
        if (!recommendSource && Array.isArray(listingsResult) && listingsResult.length > 0) {
          recommendSource = listingsResult[0];
        }
        sections.push({
          label: "Reply from Recommendation Agent",
          value: await recommendationAgent(recommendSource),
        });
      }

      return formatCombinedResponse(sections);
    }
    default:
      return {
        response: "I'm not sure how to help with that. Try asking about properties or market trends.",
      };
  }
}

export async function runAction(request: RequestPayload) {
  const payload = request.payload ?? {};

  switch (request.action) {
    case "parse_property_query": {
      const query = typeof payload.query === "string" ? payload.query : "";
      return await parsePropertyQuery(query);
    }
    case "search_active_properties": {
      const query = typeof payload.query === "string" ? payload.query : "";
      const userId = typeof payload.userId === "string" && payload.userId ? payload.userId : "default";
      const parsedPage = Number(payload.page ?? 1);
      const parsedLimit = Number(payload.limit ?? 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;
      const parsedFilters = await parsePropertyQuery(query);
      const session = getSession(userId);
      const filters = mergeSessionWithParsedFilters(session, parsedFilters);

      updateSession(userId, {
        city: filters.city ?? undefined,
        maxPrice: filters.maxPrice ?? undefined,
        beds: filters.beds ?? undefined,
        baths: filters.baths ?? undefined,
        type: filters.type ?? undefined,
        pool: filters.pool ?? undefined,
        sqft: filters.sqft ?? undefined,
        maxHoa: filters.maxHoa ?? undefined,
        hasView: filters.hasView ?? undefined,
      });

      if (countCoreActiveArgs(filters) <= 1) {
        updateSession(userId, { conversationStep: 1 });
        return buildNarrowingPrompt(filters);
      }

      const validation = await validateSearchFilters(filters);

      if (!validation.ok) {
        return validation.message;
      }

      try {
        const rows = await searchActiveListings(filters, page, limit);
        updateSession(userId, { lastResults: rows, conversationStep: 0 });
        return formatActiveListingsForWhatsapp(rows, page, limit);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown database error";
        if (/timeout/i.test(message)) {
          return "Search timed out before completion. Please narrow filters (city, price, beds) and try again.";
        }
        throw error;
      }
    }
    case "search_sold_properties": {
      const query = typeof payload.query === "string" ? payload.query : "";
      const parsedPage = Number(payload.page ?? 1);
      const parsedLimit = Number(payload.limit ?? 10);
      const parsedMonths = Number(payload.months ?? 12);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 10;
      const months = Number.isFinite(parsedMonths) && parsedMonths > 0 ? Math.floor(parsedMonths) : 12;

      const parsedFilters = await parsePropertyQuery(query);
      const filters: SoldSearchFilters = {
        ...parsedFilters,
        closeDateFrom: typeof payload.closeDateFrom === "string" ? payload.closeDateFrom : null,
        closeDateTo: typeof payload.closeDateTo === "string" ? payload.closeDateTo : null,
        minYearBuilt: Number.isFinite(Number(payload.minYearBuilt))
          ? Number(payload.minYearBuilt)
          : null,
        maxYearBuilt: Number.isFinite(Number(payload.maxYearBuilt))
          ? Number(payload.maxYearBuilt)
          : null,
      };

      const validation = await validateSoldSearchFilters(filters);
      if (!validation.ok) {
        return validation.message;
      }

      if (!filters.city) {
        return "Sold search requires a city. Please include a city in your query.";
      }

      try {
        const rows = await getSoldComps(filters, months, page, limit);
        return formatSoldListingsForWhatsapp(rows, page, limit);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown database error";
        if (/timeout/i.test(message)) {
          return "Sold search timed out before completion. Please narrow filters and try again.";
        }
        throw error;
      }
    }
    case "market_analytics": {
      const query = typeof payload.query === "string" ? payload.query : "";
      return await runMarketAnalyticsFromQuery(query);
    }
    case "semantic_search_properties": {
      const query = typeof payload.query === "string" ? payload.query : "";
      return await runSemanticSearchFromQuery(query);
    }
    case "recommend_similar_properties": {
      const query = typeof payload.query === "string" ? payload.query : "";
      return await runHybridRecommendationFromAddress(query);
    }
    case "rag_knowledge": {
      const query = typeof payload.query === "string" ? payload.query : "";
      return await runRagKnowledgeFromQuery(query);
    }
    case "orchestrate": {
      const query = typeof payload.query === "string" ? payload.query : "";
      const userId = typeof payload.userId === "string" && payload.userId ? payload.userId : "default";
      return await orchestrate(query, userId);
    }
    default:
      return { status: "WIP", action: request.action };
  }
}

function parseRequestArg(rawArg: string | undefined): RequestPayload {
  if (!rawArg) {
    throw new Error("Missing request JSON. Example: {'action':'parse_property_query','payload':{'query':'...'}}");
  }
  const parsed = JSON.parse(rawArg) as RequestPayload;
  if (!parsed || typeof parsed.action !== "string") {
    throw new Error("Invalid request JSON.");
  }
  return parsed;
}

async function main() {
  try {
    const request = parseRequestArg(process.argv[2]);
    const result = await runAction(request);
    if (typeof result === "string") {
      console.log(result);
      return;
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ status: "error", message }));
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
