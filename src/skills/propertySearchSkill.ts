// Week 2 skill: parses query text and runs real MySQL listing search.
declare const require: any;
const mysql = require("mysql2/promise");
import { parsePropertyQuery } from "../parsers/propertyQueryParser";
import { PropertyFilters } from "../types/PropertyFilters";

export interface ActiveListing {
  L_ListingID: string;
  L_DisplayId: string;
  L_Address: string;
  L_City: string;
  L_Zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  PoolPrivateYN: string | null;
  ViewYN: string | null;
}

export interface PropertySearchResult {
  filters: PropertyFilters;
  listings: ActiveListing[];
}

function createDbPool() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return mysql.createPool({
    host: env?.MYSQL_HOST,
    user: env?.MYSQL_USER,
    password: env?.MYSQL_PASSWORD,
    database: env?.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

export async function propertySearchSkill(query: string): Promise<PropertySearchResult> {
  const filters = await parsePropertyQuery(query);
  const pool = createDbPool();

  let sql = `
    SELECT
      L_ListingID,
      L_DisplayId,
      L_Address,
      L_City,
      L_Zip,
      L_SystemPrice AS price,
      L_Keyword2 AS beds,
      LM_Dec_3 AS baths,
      LM_Int2_3 AS sqft,
      L_Type_ AS type,
      PoolPrivateYN,
      ViewYN
    FROM rets_property
    WHERE L_Status = "Active"
  `;

  const params: Array<string | number> = [];

  if (filters.city) {
    sql += " AND L_City = ?";
    params.push(filters.city);
  }
  if (filters.maxPrice) {
    sql += " AND L_SystemPrice <= ?";
    params.push(filters.maxPrice);
  }
  if (filters.beds) {
    sql += " AND L_Keyword2 >= ?";
    params.push(filters.beds);
  }
  if (filters.baths) {
    sql += " AND LM_Dec_3 >= ?";
    params.push(filters.baths);
  }
  if (filters.sqft) {
    sql += " AND LM_Int2_3 >= ?";
    params.push(filters.sqft);
  }
  if (filters.type) {
    sql += " AND L_Type_ = ?";
    params.push(filters.type);
  }
  if (filters.pool) {
    sql += " AND PoolPrivateYN = ?";
    params.push(filters.pool);
  }
  if (filters.hasView) {
    sql += " AND ViewYN = ?";
    params.push(filters.hasView);
  }
  if (filters.maxHoa) {
    sql += " AND AssociationFee <= ?";
    params.push(filters.maxHoa);
  }

  sql += " ORDER BY L_SystemPrice ASC LIMIT 10";

  const [rows] = await pool.execute(sql, params);
  await pool.end();

  return {
    filters,
    listings: rows as ActiveListing[],
  };
}
