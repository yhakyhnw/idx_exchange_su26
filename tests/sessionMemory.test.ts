import assert from "node:assert/strict";
import test from "node:test";
import { clearSession, getSession, updateSession } from "../src/services/sessionMemory";

test("getSession initializes new user with conversationStep 0", () => {
  const userId = "week4-user-init";
  clearSession(userId);
  const session = getSession(userId);
  assert.equal(session.conversationStep, 0);
});

test("updateSession merges values into existing session", () => {
  const userId = "week4-user-update";
  clearSession(userId);

  updateSession(userId, { city: "Irvine", conversationStep: 1 });
  updateSession(userId, { maxPrice: 900000, beds: 3 });

  const session = getSession(userId);
  assert.equal(session.city, "Irvine");
  assert.equal(session.maxPrice, 900000);
  assert.equal(session.beds, 3);
  assert.equal(session.conversationStep, 1);
});

test("clearSession removes saved session and resets state", () => {
  const userId = "week4-user-clear";
  clearSession(userId);

  updateSession(userId, { city: "Anaheim", conversationStep: 2 });
  clearSession(userId);

  const resetSession = getSession(userId);
  assert.equal(resetSession.city, undefined);
  assert.equal(resetSession.conversationStep, 0);
});
