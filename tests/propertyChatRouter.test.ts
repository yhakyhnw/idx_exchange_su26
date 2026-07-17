import assert from "node:assert/strict";
import test from "node:test";
import { maybeHandleAdminSessionCommand } from "../src/skills/propertyChatRouter";
import { clearSession, updateSession } from "../src/services/sessionMemory";

test("returns null for non-admin messages", () => {
  const response = maybeHandleAdminSessionCommand("user-a", "show me listings");
  assert.equal(response, null);
});

test("returns empty session report when no sessions exist", () => {
  clearSession("admin-empty");
  clearSession("admin-empty-2");
  const response = maybeHandleAdminSessionCommand("admin-empty", "!admin session");

  assert.ok(response);
  assert.equal(response?.kind, "admin");
  assert.equal(response?.message.includes("No active sessions."), true);
});

test("returns active sessions by user id", () => {
  clearSession("user-1");
  clearSession("user-2");
  updateSession("user-1", { city: "Irvine", beds: 3, conversationStep: 2 });
  updateSession("user-2", { city: "Anaheim", maxPrice: 700000, conversationStep: 1 });

  const response = maybeHandleAdminSessionCommand("admin-user", "!admin session");
  assert.ok(response);
  assert.equal(response?.kind, "admin");
  assert.equal(response?.message.includes("requestedBy=admin-user"), true);
  assert.equal(response?.message.includes("user=user-1"), true);
  assert.equal(response?.message.includes("user=user-2"), true);
  assert.equal(response?.message.includes("city=Irvine"), true);
  assert.equal(response?.message.includes("city=Anaheim"), true);
});
