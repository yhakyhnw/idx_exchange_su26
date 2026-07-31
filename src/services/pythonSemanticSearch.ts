import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import type { SemanticSearchOptions, SemanticSearchPayload } from "../types/Week6SemanticRows";

const execFileAsync = promisify(execFile);

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toRequiredNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

export async function runSemanticSearchFromPython(
  query: string,
  options: SemanticSearchOptions = {},
): Promise<SemanticSearchPayload> {
  const normalizedTopK = Math.max(1, Math.min(20, Math.floor(options.topK ?? 5)));
  const normalizedCandidateLimit = Math.max(
    normalizedTopK,
    Math.min(1000, Math.floor(options.candidateLimit ?? 250)),
  );
  const scriptPath = path.resolve(process.cwd(), "src/python/semantic_search.py");
  const args = [
    scriptPath,
    "--query",
    query,
    "--top-k",
    String(normalizedTopK),
    "--candidate-limit",
    String(normalizedCandidateLimit),
  ];
  if (options.city) {
    args.push("--city", options.city);
  }

  const { stdout } = await execFileAsync("python3", args, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  const results = Array.isArray(parsed.results)
    ? parsed.results.map((row) => {
        const value = row as Record<string, unknown>;
        return {
          listing_id: String(value.listing_id ?? ""),
          display_id: toStringOrNull(value.display_id),
          address: toStringOrNull(value.address),
          city: toStringOrNull(value.city),
          zip: toStringOrNull(value.zip),
          price: toNullableNumber(value.price),
          beds: toNullableNumber(value.beds),
          baths: toNullableNumber(value.baths),
          sqft: toNullableNumber(value.sqft),
          type: toStringOrNull(value.type),
          year_built: toNullableNumber(value.year_built),
          days_on_market: toNullableNumber(value.days_on_market),
          photo_count: toNullableNumber(value.photo_count),
          pool: toStringOrNull(value.pool),
          has_view: toStringOrNull(value.has_view),
          fireplace: toStringOrNull(value.fireplace),
          remarks: toStringOrNull(value.remarks),
          similarity_score: toRequiredNumber(value.similarity_score),
        };
      })
    : [];

  return {
    query: toStringOrNull(parsed.query) ?? query,
    city: toStringOrNull(parsed.city),
    top_k: toRequiredNumber(parsed.top_k) || normalizedTopK,
    candidate_count: toRequiredNumber(parsed.candidate_count),
    results,
  };
}
