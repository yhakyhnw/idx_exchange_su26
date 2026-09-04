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
const MAX_RESULT_ROWS = 50;
type PendingEmailDraft = {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
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
  const hasDefinitionCue = /\b(what is|what does|define|meaning|explain)\b/.test(q);
  const hasStrongMarketCue =
    /\b(rising|falling|trend|trends|inventory|last\s+\d+\s*(months?|weeks?|years?)|over\s+the\s+last|month over month|mom|yoy|year over year|median price|average price)\b/.test(
      q,
    );
  const hasMarketKeyword =
    /\b(market|trend|rising|falling|price|prices|dom|days on market|inventory|list-to-close|list to close)\b/.test(
      q,
    );
  return {
    isSearch: /\b(find|show|homes?|houses?|condos?|properties|listings?)\b/.test(q),
    isMarket: hasMarketKeyword && !(hasDefinitionCue && !hasStrongMarketCue),
    isRecommend: /\b(similar|recommend|comparable|comps)\b/.test(q),
    isKnowledge: /\b(what is|what does|define|meaning|column|field|explain)\b/.test(q),
    isEmail:
      /\bapprove email\b/.test(q) ||
      /\bdelete draft\b/.test(q) ||
      /\bcheck draft\b/.test(q) ||
      /\b(?:draft|send)\b[\s\S]{0,80}\bemail\b/.test(q),
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

export function extractKnowledgeQueryForMixed(query: string): string {
  const match = query.match(
    /(explain\s.+|what is\s.+|what does\s.+|define\s.+|meaning of\s.+)$/i,
  );
  if (match?.[0]) return match[0].trim();
  return query;
}

function hasStrongMarketAnalyticsSignal(query: string): boolean {
  const q = query.toLowerCase();
  return /\b(rising|falling|trend|trends|inventory|last\s+\d+\s*(months?|weeks?|years?)|over\s+the\s+last|month over month|mom|yoy|year over year|median price|average price)\b/.test(
    q,
  );
}

function isDefinitionStyleKnowledgeQuery(query: string): boolean {
  const q = query.toLowerCase();
  return /\b(what is|what does|define|meaning|explain)\b/.test(q);
}

export async function classifyIntent(query: string): Promise<OrchestratorIntent> {
  const flags = detectIntentFlags(query);
  const strongMarketSignal = hasStrongMarketAnalyticsSignal(query);
  const definitionStyleKnowledge = isDefinitionStyleKnowledgeQuery(query);

  // Definition-style questions should route to RAG unless they also ask for analytics.
  if (
    flags.isKnowledge &&
    definitionStyleKnowledge &&
    !flags.isSearch &&
    !flags.isRecommend &&
    !flags.isEmail &&
    !strongMarketSignal
  ) {
    return "knowledge";
  }

  // Email workflow requests should route to email unless explicitly mixed with
  // property search, recommendations, or knowledge Q&A.
  if (flags.isEmail && !flags.isSearch && !flags.isRecommend && !flags.isKnowledge) {
    return "email";
  }

  if (
    flags.isKnowledge &&
    !flags.isSearch &&
    !flags.isMarket &&
    !flags.isRecommend &&
    !flags.isEmail
  ) {
    return "knowledge";
  }
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

function extractRecipientEmail(query: string): string | null {
  const match = query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function htmlFromText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div>${escaped.replace(/\n/g, "<br/>")}</div>`;
}

function buildDraftPreview(id: string, to: string, subject: string, body: string): string {
  const previewText = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .split(/\r?\n/)
    .slice(0, 8)
    .join("\n");
  return [
    "Email draft queued (pending approval).",
    `Draft ID: ${id}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Preview:",
    previewText,
    `Reply with: approve email ${id}`,
    `Or: delete draft ${id}`,
  ].join("\n");
}

function getPendingDrafts(userId: string): PendingEmailDraft[] {
  const session = getSession(userId) as {
    pendingEmailDraft?: PendingEmailDraft;
    pendingEmailDrafts?: PendingEmailDraft[];
  };
  if (Array.isArray(session.pendingEmailDrafts)) return session.pendingEmailDrafts;
  if (session.pendingEmailDraft) return [session.pendingEmailDraft];
  return [];
}

function setPendingDrafts(userId: string, drafts: PendingEmailDraft[]): void {
  updateSession(userId, {
    pendingEmailDrafts: drafts.length ? drafts : undefined,
    pendingEmailDraft: drafts.length ? drafts[0] : undefined,
  } as {
    pendingEmailDrafts?: PendingEmailDraft[];
    pendingEmailDraft?: PendingEmailDraft;
  });
}

function buildDraftListPreview(drafts: PendingEmailDraft[]): string {
  const lines = ["Saved email drafts:"];
  for (const d of drafts) {
    lines.push(`- ${d.id} | to ${d.to} | ${d.subject}`);
  }
  lines.push("Use: check draft <draftId>");
  lines.push("Use: approve email <draftId>");
  lines.push("Use: delete draft <draftId>");
  lines.push("Use: delete draft all");
  return lines.join("\n");
}

function buildDraftIdMismatchMessage(drafts: PendingEmailDraft[]): string {
  if (!drafts.length) return "Draft ID does not match the pending draft.";
  const ids = drafts.map((d) => d.id).join(", ");
  return `Draft ID does not match the pending draft. Current draft IDs: ${ids}. Use: check draft`;
}

function normalizeEmailCommandText(query: string): string {
  return query.trim().replace(/^\[[^\]]+\]\s*/i, "").trim();
}

function extractEmailIntentQuery(query: string): string {
  const cleaned = normalizeEmailCommandText(query)
    .replace(/\bemail\s+to\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    .replace(/\bdraft\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || normalizeEmailCommandText(query);
}

function extractCityFromText(query: string): string | null {
  const match = query.match(/(?:\bin\b|\bfor\b)\s+([A-Za-z\s]+?)(?:\s+over|\s+last|\s+with|\s+and|[?.!,]|$)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const cityAliasMap: Record<string, string> = {
    LA: "Los Angeles",
    SD: "San Diego",
    SB: "Santa Barbara",
    SC: "Santa Clarita",
    SF: "San Francisco",
    SJ: "San Jose",
  };
  const mapped = cityAliasMap[raw.toUpperCase()] ?? raw;
  return mapped
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function buildMarketTrendPrompt(query: string): string {
  const city = extractCityFromText(query);
  if (!city) return "Please include a city for this market analytics question.";
  return `Tell me if prices are rising in ${city} over the last 6 months.`;
}

async function getEmailSourceContent(query: string, userId: string): Promise<{ agent: string; content: string }> {
  const intentQuery = extractEmailIntentQuery(query);
  const lower = intentQuery.toLowerCase();
  const flags = detectIntentFlags(intentQuery);

  if (lower.includes("listing alert")) {
    return {
      agent: "Property Search Agent",
      content: String(await propertySearchAgent(intentQuery, userId)),
    };
  }
  if (lower.includes("weekly") || lower.includes("market report")) {
    return {
      agent: "Market Stats Agent",
      content: String(await marketStatsAgent(buildMarketTrendPrompt(intentQuery))),
    };
  }
  if (lower.includes("property summary") || lower.includes("recommendation digest") || flags.isRecommend) {
    return {
      agent: "Recommendation Agent",
      content: String(await recommendationAgent(getSession(userId).lastResults?.[0])),
    };
  }
  if (flags.isKnowledge) {
    return {
      agent: "RAG Agent",
      content: String(await ragAgent(intentQuery)),
    };
  }
  if (flags.isSearch) {
    return {
      agent: "Property Search Agent",
      content: String(await propertySearchAgent(intentQuery, userId)),
    };
  }
  return {
    agent: "Market Stats Agent",
    content: String(await marketStatsAgent(buildMarketTrendPrompt(intentQuery))),
  };
}

function hasMalformedPriceToken(query: string): boolean {
  const q = query.toLowerCase();
  const hasUnder = /\bunder\b/.test(q);
  const hasNumberedPrice = /under\s+\$?\s*[\d,.]+\s*(k|m)?\b/i.test(q);
  const hasBareSuffix = /under\s+\$?\s*(k|m)\b/i.test(q);
  return hasUnder && !hasNumberedPrice && hasBareSuffix;
}

function parseDraftAction(query: string): { type: "approve" | "delete" | "check" | "draft"; id?: string } {
  const trimmed = normalizeEmailCommandText(query);
  const approve = trimmed.match(/^approve email(?:\s+([A-Za-z0-9_-]+))?$/i);
  if (approve) return { type: "approve", id: approve[1] };
  if (/^delete draft all$/i.test(trimmed)) return { type: "delete", id: "all" };
  const del = trimmed.match(/^delete draft(?:\s+([A-Za-z0-9_-]+))?$/i);
  if (del) return { type: "delete", id: del[1] };
  if (/^cancel email all$/i.test(trimmed)) return { type: "delete", id: "all" };
  const cancel = trimmed.match(/^cancel email(?:\s+([A-Za-z0-9_-]+))?$/i);
  if (cancel) return { type: "delete", id: cancel[1] };
  const check = trimmed.match(/^check draft(?:\s+([A-Za-z0-9_-]+))?$/i);
  if (check) return { type: "check", id: check[1] };
  return { type: "draft" };
}

async function buildEmailDraftFromQuery(query: string, userId: string): Promise<{
  to: string;
  subject: string;
  body: string;
}> {
  const recipient = extractRecipientEmail(query);
  if (!recipient) {
    throw new Error("Please include a recipient email in your request.");
  }
  const lower = query.toLowerCase();
  const source = await getEmailSourceContent(query, userId);
  const sourcedBody = `Source Agent: ${source.agent}\n\n${source.content}`;

  if (lower.includes("weekly") || lower.includes("market report")) {
    return {
      to: recipient,
      subject: "Weekly Market Report",
      body: htmlFromText(sourcedBody),
    };
  }

  if (lower.includes("listing alert") || lower.includes("listing alerts")) {
    return {
      to: recipient,
      subject: "New Listing Alert",
      body: htmlFromText(sourcedBody),
    };
  }

  if (lower.includes("property summary")) {
    return {
      to: recipient,
      subject: "Property Summary",
      body: htmlFromText(sourcedBody),
    };
  }

  if (lower.includes("recommendation digest") || lower.includes("digest")) {
    return {
      to: recipient,
      subject: "Personalized Recommendation Digest",
      body: htmlFromText(sourcedBody),
    };
  }

  throw new Error(
    "Email request not recognized. Use one of: listing alert, weekly market report, property summary, recommendation digest.",
  );
}

async function emailDraftAgent(query: string, userId: string): Promise<unknown> {
  const action = parseDraftAction(query);
  const pendingDrafts = getPendingDrafts(userId);

  if (action.type === "check") {
    if (!pendingDrafts.length) return "No pending email draft saved.";
    if (!action.id) return buildDraftListPreview(pendingDrafts);
    const draft = pendingDrafts.find((d) => d.id === action.id);
    if (!draft) {
      return buildDraftIdMismatchMessage(pendingDrafts);
    }
    return buildDraftPreview(
      draft.id,
      draft.to,
      draft.subject,
      draft.body,
    );
  }

  if (action.type === "delete") {
    if (!pendingDrafts.length) return "No pending email draft to delete.";
    if (action.id === "all") {
      setPendingDrafts(userId, []);
      return "All pending email drafts deleted.";
    }
    if (!action.id) {
      return "Please include the draft ID. Example: delete draft <draftId>";
    }
    const nextDrafts = pendingDrafts.filter((d) => d.id !== action.id);
    if (nextDrafts.length === pendingDrafts.length) {
      return buildDraftIdMismatchMessage(pendingDrafts);
    }
    setPendingDrafts(userId, nextDrafts);
    return `Pending email draft ${action.id} deleted.`;
  }

  if (action.type === "approve") {
    if (!action.id) {
      if (pendingDrafts[0]?.id) {
        return `Please include the draft ID. Example: approve email ${pendingDrafts[0].id}`;
      }
      return "Please include the draft ID. Example: approve email <draftId>";
    }
    if (!pendingDrafts.length) return "No pending email draft to approve.";
    const draft = pendingDrafts.find((d) => d.id === action.id);
    if (!draft) {
      return buildDraftIdMismatchMessage(pendingDrafts);
    }
    const { sendApprovedEmail } = await import("./emailAgent.ts");
    await sendApprovedEmail({
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    });
    setPendingDrafts(
      userId,
      pendingDrafts.filter((d) => d.id !== action.id),
    );
    return `Email sent to ${draft.to}.`;
  }

  const { to, subject, body } = await buildEmailDraftFromQuery(query, userId);
  const { draft } = await (await import("./emailAgent.ts")).draftEmail(to, subject, body);
  const draftId = `d${Date.now()}`;
  setPendingDrafts(userId, [
    ...pendingDrafts,
    {
      id: draftId,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      createdAt: new Date().toISOString(),
    },
  ]);
  return buildDraftPreview(draftId, draft.to, draft.subject, draft.body);
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
        { label: "Reply from Email Draft Agent", value: await emailDraftAgent(query, userId) },
      ]);
    case "mixed": {
      const flags = detectIntentFlags(query);
      const sections: Array<{ label: string; value: unknown }> = [];
      const searchQuery = extractSearchQueryForMixed(query);
      const knowledgeQuery = extractKnowledgeQueryForMixed(query);

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
        parallelTasks.push(ragAgent(knowledgeQuery));
        parallelLabels.push("Reply from RAG Agent");
      }
      if (flags.isEmail) {
        parallelTasks.push(emailDraftAgent(query, userId));
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
      if (hasMalformedPriceToken(query)) {
        return 'Price amount is missing before "k/m". Please resend like "under 900k" (without $) or "under 900000".';
      }
      const parsedPage = Number(payload.page ?? 1);
      const parsedLimit = Number(payload.limit ?? 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), MAX_RESULT_ROWS) : 10;
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
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), MAX_RESULT_ROWS) : 10;
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
    case "whatsapp_message": {
      const message = typeof payload.query === "string" ? payload.query : "";
      const userId = typeof payload.userId === "string" && payload.userId ? payload.userId : "default";
      const { onWhatsAppMessage } = await import("./whatsappHandler.ts");
      return await onWhatsAppMessage(message, userId);
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
