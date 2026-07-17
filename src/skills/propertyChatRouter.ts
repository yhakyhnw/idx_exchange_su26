import type { PropertySearchResult } from "./propertySearchSkill";
import { getAllSessions, getSession, updateSession } from "../services/sessionMemory";

export type PropertyChatResponse =
  | { kind: "admin"; message: string }
  | { kind: "search"; result: PropertySearchResult };

function normalizeCommand(input: string): string {
  return input.trim().toLowerCase();
}

function printValue(value: string | number | undefined): string {
  return value === undefined ? "-" : String(value);
}

export function maybeHandleAdminSessionCommand(
  userId: string,
  input: string,
): PropertyChatResponse | null {
  if (normalizeCommand(input) !== "!admin session") {
    return null;
  }

  const rows = getAllSessions();
  if (rows.length === 0) {
    return { kind: "admin", message: "ADMIN SESSION REPORT\nNo active sessions." };
  }

  const lines = rows.map(({ userId: sessionUserId, session }, index) => {
    const resultCount = session.lastResults?.length ?? 0;
    return `${index + 1}) user=${sessionUserId} step=${session.conversationStep} city=${printValue(session.city)} maxPrice=${printValue(session.maxPrice)} beds=${printValue(session.beds)} baths=${printValue(session.baths)} type=${printValue(session.type)} pool=${printValue(session.pool)} results=${resultCount}`;
  });

  return {
    kind: "admin",
    message: `ADMIN SESSION REPORT (${rows.length})\nrequestedBy=${userId}\n${lines.join("\n")}`,
  };
}

export async function handlePropertyChatInput(
  userId: string,
  input: string,
  page = 1,
  limit = 10,
  months = 12,
): Promise<PropertyChatResponse> {
  const adminResponse = maybeHandleAdminSessionCommand(userId, input);
  if (adminResponse) {
    return adminResponse;
  }

  const { propertySearchSkill } = await import("./propertySearchSkill");
  const result = await propertySearchSkill(input, page, limit, months);
  const previousStep = getSession(userId).conversationStep;

  updateSession(userId, {
    city: result.filters.city ?? undefined,
    maxPrice: result.filters.maxPrice ?? undefined,
    beds: result.filters.beds ?? undefined,
    baths: result.filters.baths ?? undefined,
    type: result.filters.type ?? undefined,
    pool: result.filters.pool ?? undefined,
    lastResults: result.listings,
    conversationStep: previousStep + 1,
  });

  return { kind: "search", result };
}
