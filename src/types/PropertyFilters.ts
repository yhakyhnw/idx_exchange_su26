// Defines the structured filters parsed from a natural-language property search query.
export interface PropertyFilters {
  city: string | null;
  maxPrice: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string | null;
  pool: "True" | null;
  hasView: "True" | null;
  maxHoa: number | null;
}
