import { query } from "./db.ts";
import type { ListingRow, PropertyFilters } from "./types.ts";

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

export function buildSearchActiveListingsQuery(
  filters: PropertyFilters,
  page = 1,
  limit = 10,
) {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    const offset = (safePage - 1) * safeLimit;
    let sql = `
        SELECT
            L_ListingID, L_DisplayId, L_Address, L_City, L_Zip,
            L_SystemPrice AS price, L_Keyword2 AS beds, LM_Dec_3 AS baths,
            LM_Int2_3 AS sqft, L_Type_ AS type, L_Status AS status,
            LMD_MP_Latitude AS lat, LMD_MP_Longitude AS lng,
            YearBuilt, AssociationFee, DaysOnMarket,
            PoolPrivateYN, ViewYN, FireplaceYN, PhotoCount,
            LA1_UserFirstName, LA1_UserLastName, LO1_OrganizationName
            FROM rets_property WHERE L_Status = "Active"
        `;
    const params: any[] = [];

    if (filters.city) { sql += " AND L_City = ?";
params.push(filters.city); }
    if (filters.maxPrice) { sql += " AND L_SystemPrice <= ?";
params.push(filters.maxPrice); }
    if (filters.beds) { sql += " AND L_Keyword2 = ?";
params.push(filters.beds); }
    if (filters.baths) { sql += " AND LM_Dec_3 >= ?";
params.push(filters.baths); }
    if (filters.sqft) { sql += " AND LM_Int2_3 >= ?";
params.push(filters.sqft); }
    if (filters.type) { sql += " AND L_Type_ = ?";
params.push(filters.type); }
    if (filters.pool) { sql += " AND PoolPrivateYN = ?";
params.push(filters.pool); }
    if (filters.hasView) { sql += " AND ViewYN = ?";
params.push(filters.hasView); }
    if (filters.maxHoa) { sql += " AND AssociationFee <= ?";
params.push(filters.maxHoa); }

    sql += ` ORDER BY L_SystemPrice ASC LIMIT ${safeLimit} OFFSET ${offset}`;
    return { sql, params };
}

export async function searchActiveListings(filters: PropertyFilters, page = 1,
limit = 10) {
    const { sql, params } = buildSearchActiveListingsQuery(filters, page, limit);
    return query<ListingRow>(sql, params);
}

export function formatActiveListingsForWhatsapp(rows: ListingRow[], page: number, limit: number): string {
  if (!rows.length) {
    return "There are no returned results.";
  }

  const pageText = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const limitText = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : rows.length;
  const lines = [`Found ${rows.length} listing(s) on page ${pageText} (limit ${limitText}):`];

  for (const row of rows) {
    const beds = row.beds ?? "-";
    const baths = row.baths ?? "-";
    const sqft = row.sqft ? `${row.sqft.toLocaleString()} sqft` : "-";
    const cityZip = [row.L_City, row.L_Zip].filter(Boolean).join(" ");
    lines.push(
      `- ${row.L_Address} ${cityZip} | ${formatCurrency(row.price)} | ${beds} bd / ${baths} ba | ${sqft}`,
    );
  }

  return lines.join("\n");
}
