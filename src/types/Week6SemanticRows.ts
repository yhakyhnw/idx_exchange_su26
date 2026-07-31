export interface SemanticListingResultRow {
  listing_id: string;
  display_id: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  type: string | null;
  year_built: number | null;
  days_on_market: number | null;
  photo_count: number | null;
  pool: string | null;
  has_view: string | null;
  fireplace: string | null;
  remarks: string | null;
  similarity_score: number;
}

export interface SemanticSearchPayload {
  query: string;
  city: string | null;
  top_k: number;
  candidate_count: number;
  results: SemanticListingResultRow[];
}

export interface SemanticSearchOptions {
  city?: string | null;
  topK?: number;
  candidateLimit?: number;
}
