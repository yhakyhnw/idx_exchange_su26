import { query } from "./db.ts";
import type { PropertyFilters, SoldRow } from "./types.ts";

export type SoldSearchFilters = PropertyFilters & {
  closeDateFrom?: string | null;
  closeDateTo?: string | null;
  minYearBuilt?: number | null;
  maxYearBuilt?: number | null;
};

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

export function buildSoldCompsQuery(
  filters: SoldSearchFilters,
  months = 12,
  page = 1,
  limit = 10,
) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  const offset = (safePage - 1) * safeLimit;
  let sql = `
      SELECT
          ListingKey, UnparsedAddress, City, CloseDate, ClosePrice,
          OriginalListPrice, ListPrice, DaysOnMarket,
          BedroomsTotal, BathroomsTotalInteger, LivingArea,
          PropertyType, PropertySubType, YearBuilt,
          ListAgentFullName, ListOfficeName, BuyerOfficeName
      FROM california_sold
      WHERE PropertyType = "Residential"
      `;
  const params: unknown[] = [];

  if (filters.city) {
    sql += " AND City = ?";
    params.push(filters.city);
  }
  if (filters.closeDateFrom) {
    sql += " AND CloseDate >= ?";
    params.push(filters.closeDateFrom);
  } else {
    sql += " AND CloseDate >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)";
    params.push(months);
  }
  if (filters.closeDateTo) {
    sql += " AND CloseDate <= ?";
    params.push(filters.closeDateTo);
  }
  if (filters.maxPrice !== null) {
    sql += " AND ClosePrice <= ?";
    params.push(filters.maxPrice);
  }
  if (filters.beds !== null) {
    sql += " AND BedroomsTotal >= ?";
    params.push(filters.beds);
  }
  if (filters.baths !== null) {
    sql += " AND BathroomsTotalInteger >= ?";
    params.push(filters.baths);
  }
  if (filters.sqft !== null) {
    sql += " AND LivingArea >= ?";
    params.push(filters.sqft);
  }
  if (filters.minYearBuilt !== null && filters.minYearBuilt !== undefined) {
    sql += " AND YearBuilt >= ?";
    params.push(filters.minYearBuilt);
  }
  if (filters.maxYearBuilt !== null && filters.maxYearBuilt !== undefined) {
    sql += " AND YearBuilt <= ?";
    params.push(filters.maxYearBuilt);
  }

  sql += ` ORDER BY CloseDate DESC LIMIT ${safeLimit} OFFSET ${offset}`;
  return { sql, params };
}

export async function getSoldComps(
  filters: SoldSearchFilters,
  months = 12,
  page = 1,
  limit = 10,
) {
  const { sql, params } = buildSoldCompsQuery(filters, months, page, limit);
  return query<SoldRow>(sql, params);
}

export function formatSoldListingsForWhatsapp(rows: SoldRow[], page: number, limit: number): string {
  if (!rows.length) {
    return "No sold listings matched your filters. Try widening city/price/bed filters.";
  }

  const pageText = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const limitText = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : rows.length;
  const lines = [`Found ${rows.length} sold listing(s) on page ${pageText} (limit ${limitText}):`];

  for (const row of rows) {
    const beds = row.BedroomsTotal ?? "-";
    const baths = row.BathroomsTotalInteger ?? "-";
    const sqft = row.LivingArea ? `${row.LivingArea.toLocaleString()} sqft` : "-";
    const closeDate = row.CloseDate ?? "-";
    lines.push(
      `- ${row.UnparsedAddress}, ${row.City} | Sold ${formatCurrency(row.ClosePrice)} on ${closeDate} | ${beds} bd / ${baths} ba | ${sqft}`,
    );
  }

  return lines.join("\n");
}
