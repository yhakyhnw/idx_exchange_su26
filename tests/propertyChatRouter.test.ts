import assert from "node:assert/strict";
import test from "node:test";
import {
  countSpecifiedFilters,
  handlePropertyChatInput,
  mergeFiltersWithSession,
} from "../src/skills/propertyChatRouter";
import { clearSession, getSession, updateSession } from "../src/services/sessionMemory";

test("countSpecifiedFilters counts non-null filters only", () => {
  const total = countSpecifiedFilters({
    city: "Irvine",
    maxPrice: 900000,
    beds: null,
    baths: null,
    sqft: null,
    type: "Condominium",
    pool: null,
    hasView: null,
    maxHoa: null,
  });
  assert.equal(total, 3);
});

test("mergeFiltersWithSession prefers new values and reuses saved values", () => {
  const userId = "merge-filters-user";
  clearSession(userId);
  updateSession(userId, { city: "Irvine", beds: 3, conversationStep: 0 });
  const session = getSession(userId);

  const merged = mergeFiltersWithSession(
    {
      city: null,
      maxPrice: 1_100_000,
      beds: null,
      baths: 2.5,
      sqft: null,
      type: null,
      pool: null,
      hasView: null,
      maxHoa: null,
    },
    session,
  );

  assert.equal(merged.city, "Irvine");
  assert.equal(merged.maxPrice, 1_100_000);
  assert.equal(merged.beds, 3);
  assert.equal(merged.baths, 2.5);
});

test("single-filter message triggers progressive follow-up prompt", async () => {
  const userId = "progressive-user";
  clearSession(userId);

  const response = await handlePropertyChatInput(userId, "Homes in Irvine");
  assert.equal(response.kind, "prompt");
  if (response.kind === "prompt") {
    assert.equal(response.message.length > 0, true);
  }
});
