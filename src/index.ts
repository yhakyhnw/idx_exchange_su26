import { parsePropertyQuery } from "./parsePropertyQuery.ts";
import { validateSearchFilters } from "./validateActiveSearchFilters.ts";
import { formatActiveListingsForWhatsapp, searchActiveListings } from "./searchActiveListings.ts";
import { closePool } from "./db.ts";
import { validateSoldSearchFilters } from "./validateSoldSearchFilters.ts";
import { formatSoldListingsForWhatsapp, getSoldComps } from "./getSoldComps.ts";
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

void main();
