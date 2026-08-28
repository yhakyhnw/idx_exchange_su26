import test from "node:test";
import assert from "node:assert/strict";
import { detectIntentFlags, extractSearchQueryForMixed, orchestrate } from "../src/index.ts";

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

test("orchestrate returns WIP for email-only intent", async () => {
  const result = await orchestrate("Draft an email summary for this client", "test-user");
  assert.equal(result, "WIP");
});
