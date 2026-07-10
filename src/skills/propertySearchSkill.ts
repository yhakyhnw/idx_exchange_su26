// Week 3 skill: parser + parameterized MLS query services.
import { parsePropertyQuery } from "../parsers/propertyQueryParser";
import { PropertyFilters } from "../types/PropertyFilters";
import { getSoldComps, searchActiveListings } from "../services/mlsQueries";
import { ListingRow, SoldRow } from "../types/Week3Rows";
import {
  buildActiveListingsQuery,
  buildSoldCompsQuery,
  type BuiltQuery,
} from "../services/mlsQueryBuilders";

type SqlQueryDetails = {
  activeListings: BuiltQuery;
  soldComps: BuiltQuery | null;
};

export interface PropertySearchResult {
  filters: PropertyFilters;
  listings: ListingRow[];
  soldComps: SoldRow[];
  sql: SqlQueryDetails;
  pagination: {
    page: number;
    limit: number;
  };
}

function normalizePage(page: number): number {
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 10;
  }
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

export async function propertySearchSkill(
  query: string,
  page = 1,
  limit = 10,
  months = 12,
): Promise<PropertySearchResult> {
  const filters = await parsePropertyQuery(query);
  const normalizedPage = normalizePage(page);
  const normalizedLimit = normalizeLimit(limit);

  const activeListingsSql = buildActiveListingsQuery(filters, normalizedPage, normalizedLimit);
  const listings = await searchActiveListings(filters, normalizedPage, normalizedLimit);
  const soldCompsSql = filters.city ? buildSoldCompsQuery(filters.city, months) : null;
  const soldComps = filters.city ? await getSoldComps(filters.city, months) : [];

  return {
    filters,
    listings,
    soldComps,
    sql: {
      activeListings: activeListingsSql,
      soldComps: soldCompsSql,
    },
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
    },
  };
}
