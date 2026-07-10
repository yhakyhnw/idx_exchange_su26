import { query } from "../db/mysql";
import { ListingRow, SoldRow } from "../types/Week3Rows";
import { PropertyFilters } from "../types/PropertyFilters";
import { buildActiveListingsQuery, buildSoldCompsQuery } from "./mlsQueryBuilders";

export async function searchActiveListings(filters: PropertyFilters, page = 1, limit = 10) {
  const { sql, params } = buildActiveListingsQuery(filters, page, limit);
  return query<ListingRow>(sql, params);
}

export async function getSoldComps(city: string, months = 12) {
  const { sql, params } = buildSoldCompsQuery(city, months);
  return query<SoldRow>(sql, params);
}
