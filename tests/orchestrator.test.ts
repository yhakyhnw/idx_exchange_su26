import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyIntent,
  detectIntentFlags,
  extractKnowledgeQueryForMixed,
  extractSearchQueryForMixed,
} from "../src/index.ts";
import { clearSession, updateSession } from "../src/chatbotScript.ts";

test("detectIntentFlags identifies mixed search and market intent", () => {
  const flags = detectIntentFlags(
    "Find me affordable homes in Pasadena and tell me whether prices are rising",
  );
  assert.equal(flags.isSearch, true);
  assert.equal(flags.isMarket, true);
});

test("detectIntentFlags keeps definition-only DOM query out of market intent", () => {
  const flags = detectIntentFlags("Explain what DOM means.");
  assert.equal(flags.isKnowledge, true);
  assert.equal(flags.isMarket, false);
});

test("extractSearchQueryForMixed trims market clause from search side", () => {
  const query = "Find me affordable homes in Pasadena and tell me whether prices are rising";
  const searchQuery = extractSearchQueryForMixed(query);
  assert.equal(searchQuery, "Find me affordable homes in Pasadena");
});

test("extractSearchQueryForMixed trims and-give-me market clause", () => {
  const query =
    "Find homes in Los Angeles between 2M and 3M and give me market statistics there for the last 6 months";
  const searchQuery = extractSearchQueryForMixed(query);
  assert.equal(searchQuery, "Find homes in Los Angeles between 2M and 3M");
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

test("recommend similar comps stays recommend-only even if homes is in the sentence", async () => {
  const query = "Recommend similar comps for homes in Los Angeles under $3M with exactly 4 baths";
  const flags = detectIntentFlags(query);
  assert.equal(flags.isRecommend, true);
  assert.equal(flags.isSearch, false);
  assert.equal(await classifyIntent(query), "recommend");
  assert.equal(await classifyIntent("Recommend similar comps"), "recommend");
});

test("find plus recommend still counts as mixed", async () => {
  const query = "Find 3 bed condos in Irvine under 2M and recommend similar comps";
  const flags = detectIntentFlags(query);
  assert.equal(flags.isSearch, true);
  assert.equal(flags.isRecommend, true);
  assert.equal(await classifyIntent(query), "mixed");
});

test("search plus market on a first turn stays mixed", async () => {
  const userId = "test-first-mixed-search-market";
  clearSession(userId);
  const query =
    "Find homes in Los Angeles between 2M and 3M and give me market statistics there for the last 6 months";
  assert.equal(await classifyIntent(query, userId), "mixed");
});

test("baths follow-up after a search does not re-run market", async () => {
  const userId = "test-filter-followup";
  clearSession(userId);
  updateSession(userId, {
    city: "Los Angeles",
    minPrice: 2000000,
    maxPrice: 3000000,
    lastResults: [{ L_Address: "1 Test St" }],
  });
  const query =
    "Find homes in Los Angeles between 2M and 3M with exactly 4 baths and give me market statistics there for the last 6 months";
  assert.equal(await classifyIntent(query, userId), "search");
  clearSession(userId);
});
