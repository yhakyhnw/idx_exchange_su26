import { redactLocalPaths, spawnPythonFromSrc } from "./repoPaths.ts";

type RagResponse = {
  answer?: string;
  sources?: string[];
};

export async function runRagKnowledgeFromQuery(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) return "Please include a question for knowledge retrieval.";

  const result = spawnPythonFromSrc(import.meta.url, "ragKnowledge.py", [
    "--query",
    trimmed,
    "--top-k",
    "4",
  ]);

  if (result.status !== 0) {
    const err = redactLocalPaths((result.stderr || result.stdout || "").trim());
    return err || "RAG knowledge retrieval failed.";
  }

  try {
    const payload = JSON.parse((result.stdout || "").trim()) as RagResponse;
    const answer = (payload.answer || "").trim();
    const sources = payload.sources || [];
    if (!answer) return "No answer returned.";
    if (!sources.length) return answer;
    return `${answer}\n\nSources: ${sources.join(" | ")}`;
  } catch {
    return (result.stdout || "").trim() || "No RAG output returned.";
  }
}
