import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RecommendationRow = {
  L_Address?: string | null;
  L_City?: string | null;
  L_Zip?: string | null;
  L_SystemPrice?: number | null;
  L_Keyword2?: number | null;
  LM_Dec_3?: number | null;
  LM_Int2_3?: number | null;
  similarity_score?: number | null;
  comp_price?: number | null;
  comp_count?: number | null;
  delta_pct?: number | null;
};

type RecommendationResponse = {
  error?: string;
  target?: Record<string, unknown>;
  results?: RecommendationRow[];
};

function formatMoney(value: unknown): string {
  const num = Number(value);
  return Number.isFinite(num) ? `$${Math.round(num).toLocaleString()}` : "N/A";
}

function formatAssessment(deltaPct: unknown): string {
  const value = Number(deltaPct);
  if (!Number.isFinite(value)) return "no comp signal";
  if (value <= -5) return "below comp";
  if (value >= 5) return "above comp";
  return "near comp";
}

export async function runHybridRecommendationFromAddress(targetAddress: string): Promise<string> {
  const trimmed = targetAddress.trim();
  if (!trimmed) return "Please include the target listing address.";

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const scriptPath = path.join(currentDir, "hybridRecommendation.py");

  const args = [
    "python3",
    scriptPath,
    "--target-address",
    trimmed,
    "--top-k",
    "5",
  ];

  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    cwd: currentDir,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    return err || "Recommendation query failed.";
  }

  try {
    const payload = JSON.parse((result.stdout || "").trim()) as RecommendationResponse;
    if (payload.error) return payload.error;
    const rows = payload.results ?? [];
    if (!rows.length) return "No recommendations found.";

    const lines = [`Top ${rows.length} similar active listings:`];
    for (const row of rows) {
      const address = row.L_Address ?? "Unknown address";
      const cityZip = [row.L_City, row.L_Zip].filter(Boolean).join(" ");
      const beds = row.L_Keyword2 ?? "-";
      const baths = row.LM_Dec_3 ?? "-";
      const sqft = row.LM_Int2_3 ? `${Number(row.LM_Int2_3).toLocaleString()} sqft` : "-";
      const score = Number(row.similarity_score);
      const delta = Number(row.delta_pct);
      const compCount = Number(row.comp_count);
      lines.push(
        `- ${address} ${cityZip} | ${formatMoney(row.L_SystemPrice)} | ${beds} bd / ${baths} ba | ${sqft} | score ${Number.isFinite(score) ? score.toFixed(2) : "N/A"} | comp ${formatMoney(row.comp_price)} (${Number.isFinite(compCount) ? compCount : 0}) | delta ${Number.isFinite(delta) ? `${delta.toFixed(1)}%` : "N/A"} (${formatAssessment(row.delta_pct)})`,
      );
    }
    return lines.join("\n");
  } catch {
    return (result.stdout || "").trim() || "No recommendation output returned.";
  }
}
