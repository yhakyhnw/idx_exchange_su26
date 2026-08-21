import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SemanticListingRow = {
  L_Address?: string | null;
  L_City?: string | null;
  L_Zip?: string | null;
  L_SystemPrice?: number | null;
  L_Keyword2?: number | null;
  LM_Dec_3?: number | null;
  LM_Int2_3?: number | null;
  _similarity?: number | null;
};

type SemanticSearchResponse = {
  query: string;
  top_k: number;
  candidate_limit: number;
  results: SemanticListingRow[];
};

function formatCurrency(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? `$${Math.round(num).toLocaleString()}` : "N/A";
}

function formatSimilarity(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(3) : "N/A";
}

function formatSemanticResultsForWhatsapp(payload: SemanticSearchResponse): string {
  const rows = payload.results ?? [];
  if (!rows.length) {
    return "No semantically similar active listings found for that description.";
  }

  const lines = [`Top ${rows.length} semantically similar active listings:`];
  for (const row of rows) {
    const address = row.L_Address ?? "Unknown address";
    const cityZip = [row.L_City, row.L_Zip].filter(Boolean).join(" ");
    const beds = row.L_Keyword2 ?? "-";
    const baths = row.LM_Dec_3 ?? "-";
    const sqft = row.LM_Int2_3 ? `${Number(row.LM_Int2_3).toLocaleString()} sqft` : "-";
    lines.push(
      `- ${address} ${cityZip} | ${formatCurrency(row.L_SystemPrice)} | ${beds} bd / ${baths} ba | ${sqft} | sim ${formatSimilarity(row._similarity)}`,
    );
  }

  return lines.join("\n");
}

export async function runSemanticSearchFromQuery(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) return "Please include a property description for semantic search.";

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const scriptPath = path.join(currentDir, "embeddingVectorSearch.py");

  const args = ["python3", scriptPath, "--query", trimmed, "--top-k", "5"];
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    cwd: currentDir,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    return err || "Semantic search failed.";
  }

  try {
    const parsed = JSON.parse((result.stdout || "").trim()) as SemanticSearchResponse;
    return formatSemanticResultsForWhatsapp(parsed);
  } catch {
    return (result.stdout || "").trim() || "No semantic search output returned.";
  }
}
