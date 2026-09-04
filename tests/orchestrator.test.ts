import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyIntent,
  detectIntentFlags,
  extractKnowledgeQueryForMixed,
  extractSearchQueryForMixed,
} from "../src/index.ts";

test("detectIntentFlags identifies mixed search and market intent", () => {
  const flags = detectIntentFlags(
    "Find me affordable homes in Pasadena and tell me whether prices are rising",
  );
  assert.equal(flags.isSearch, true);
  assert.equal(flags.isMarket, true);
});

test("extractSearchQueryForMixed trims market clause from search side", () => {
  const query = "Find me affordable homes in Pasadena and tell me whether prices are rising";
  const searchQuery = extractSearchQueryForMixed(query);
  assert.equal(searchQuery, "Find me affordable homes in Pasadena");
});

test("extractKnowledgeQueryForMixed trims to knowledge clause", () => {
  const query = "Find homes in Pasadena under 900k, tell me if prices are rising, and explain what DOM means";
  const knowledgeQuery = extractKnowledgeQueryForMixed(query);
  assert.equal(knowledgeQuery, "explain what DOM means");
});

test("classifyIntent identifies email-only intent", async () => {
  const intent = await classifyIntent("Send email to test@example.com");
  assert.equal(intent, "email");
});

test("classifyIntent routes definition-style DOM query to knowledge", async () => {
  const intent = await classifyIntent("Explain what days on market (DOM) means.");
  assert.equal(intent, "knowledge");
});
