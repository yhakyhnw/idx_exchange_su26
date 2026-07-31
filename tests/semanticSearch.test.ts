import assert from "node:assert/strict";
import test from "node:test";
import { isSemanticSearchIntent, semanticSearchSkill } from "../src/skills/semanticSearchSkill";

const shouldRunSemanticCli = process.argv.includes("--run-semantic");

const DEFAULT_WEEK6_QUERIES = [
  "Find similar homes in Pasadena with charming craftsman style and mountain views",
  "Show me listings in Irvine with modern open floor plans and lots of natural light",
  "Looking for homes in San Diego with coastal vibe and updated kitchens",
  "Find homes in Newport Beach with airy interiors, ocean-view feel, and high-end finishes",
  "Show similar listings in Los Angeles with character homes, strong curb appeal, and natural light",
  "Looking for homes in Santa Barbara with Spanish style, private outdoor space, and warm interiors",
  "Find homes in Oakland with urban loft vibe, high ceilings, and open-concept living",
  "Show listings in Sacramento with family-friendly layout, big backyard, and quiet neighborhood feel",
  "Find places in San Jose with contemporary design, bright kitchens, and move-in-ready condition",
  "Show similar homes in Riverside with mountain-view vibe, updated bathrooms, and good natural light",
];

async function runSemanticCli() {
  const queryParts = process.argv.filter((arg) => arg !== "--run-semantic").slice(2);
  const queries = queryParts.length > 0 ? [queryParts.join(" ")] : DEFAULT_WEEK6_QUERIES;

  try {
    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index];
      const result = await semanticSearchSkill(query, { topK: 5 });

      console.log(`\n=== QUERY ${index + 1} ===`);
      console.log(query);
      console.log("--- RESULTS (COSINE + REMARKS) ---");

      if (result.data.results.length === 0) {
        console.log("No semantic matches returned.");
        continue;
      }

      for (let i = 0; i < result.data.results.length; i += 1) {
        const row = result.data.results[i];
        console.log(
          `${i + 1}) ${row.address ?? "-"}, ${row.city ?? "-"} | score=${row.similarity_score.toFixed(6)}`,
        );
        console.log(`   remarks: ${row.remarks ?? "-"}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`RUN_SEMANTIC_ERROR: ${message}`);
    process.exitCode = 1;
  }
}

if (shouldRunSemanticCli) {
  void runSemanticCli();
} else {
  test("isSemanticSearchIntent identifies semantic-style prompts", () => {
    assert.equal(isSemanticSearchIntent("Find similar homes in Pasadena"), true);
    assert.equal(isSemanticSearchIntent("Need market stats in Irvine"), false);
  });

  test("semanticSearchSkill export is callable", async () => {
    assert.equal(typeof semanticSearchSkill, "function");
  });
}
