import { runSemanticSearchFromPython } from "../services/pythonSemanticSearch";
import type { SemanticSearchOptions, SemanticSearchPayload } from "../types/Week6SemanticRows";

export interface SemanticSearchSkillResult {
  query: string;
  options: Required<SemanticSearchOptions>;
  data: SemanticSearchPayload;
  summary: string;
}

const SEMANTIC_INTENT_PATTERN =
  /\b(semantic|similar|most similar|match(?:ing|es)?|like this|like that|style|character|vibe|charming|craftsman|mountain views?|ocean views?)\b/i;

export function isSemanticSearchIntent(question: string): boolean {
  return SEMANTIC_INTENT_PATTERN.test(question);
}

function parseCityFromSemanticQuestion(question: string): string | null {
  const match = question.match(
    /(?:in|near|around)\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+(?:with|under|over|and|that|for|priced|between|having)\b|[?.!,]|$)/i,
  );
  if (!match) {
    return null;
  }
  const city = match[1].trim().replace(/\s+/g, " ");
  if (!city) {
    return null;
  }
  return city
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatCurrency(value: number | null): string {
  if (!Number.isFinite(value as number)) {
    return "-";
  }
  return `$${Math.round(value as number).toLocaleString()}`;
}

function formatRemarks(remarks: string | null): string {
  if (!remarks) {
    return "-";
  }
  const normalized = remarks.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "-";
  }
  return normalized;
}

function formatSummary(data: SemanticSearchPayload): string {
  if (data.results.length === 0) {
    const cityText = data.city ? ` in ${data.city}` : "";
    return `No active listings found${cityText} for semantic query: "${data.query}".`;
  }

  const header = `Top ${data.results.length} semantic matches from active rets_property listings${
    data.city ? ` in ${data.city}` : ""
  }:`;
  const lines = data.results.map((row, index) => {
    const address = row.address ? `${row.address}, ${row.city ?? "-"}` : `${row.city ?? "Unknown city"}`;
    return `${index + 1}) ${address} | ${formatCurrency(row.price)} | ${row.beds ?? "-"} bd/${
      row.baths ?? "-"
    } ba | ${row.sqft ?? "-"} sqft | score=${row.similarity_score.toFixed(4)}\n   Remarks: ${formatRemarks(
      row.remarks,
    )}`;
  });
  return [header, ...lines].join("\n");
}

export async function semanticSearchSkill(
  query: string,
  options: SemanticSearchOptions = {},
): Promise<SemanticSearchSkillResult> {
  const normalizedOptions: Required<SemanticSearchOptions> = {
    city: options.city ?? parseCityFromSemanticQuestion(query),
    topK: options.topK ?? 5,
    candidateLimit: options.candidateLimit ?? 250,
  };

  const data = await runSemanticSearchFromPython(query, normalizedOptions);
  return {
    query,
    options: normalizedOptions,
    data,
    summary: formatSummary(data),
  };
}
