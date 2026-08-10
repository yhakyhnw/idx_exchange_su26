import type { ListingRow, PropertyFilters } from "./types.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface UserSession {
  city?: string;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  type?: string;
  pool?: string;
  sqft?: number;
  maxHoa?: number;
  hasView?: string;
  lastResults?: ListingRow[];
  conversationStep: number;
}

const sessions = new Map<string, UserSession>();
const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const sessionStorePath = path.join(currentDir, "userSessions.json");

function loadSessionsFromDisk(): void {
  if (!existsSync(sessionStorePath)) return;
  try {
    const raw = readFileSync(sessionStorePath, "utf8");
    if (!raw.trim()) return;
    const data = JSON.parse(raw) as Record<string, UserSession>;
    for (const [userId, session] of Object.entries(data)) {
      sessions.set(userId, session);
    }
  } catch {
    // If session file is corrupted, keep runtime functional with empty session map.
  }
}

function saveSessionsToDisk(): void {
  const data = Object.fromEntries(sessions.entries());
  writeFileSync(sessionStorePath, JSON.stringify(data, null, 2), "utf8");
}

loadSessionsFromDisk();

export function getSession(userId: string): UserSession {
  if (!sessions.has(userId)) {
    sessions.set(userId, { conversationStep: 0 });
  }
  return sessions.get(userId)!;
}

export function updateSession(userId: string, updates: Partial<UserSession>) {
  const session = getSession(userId);
  sessions.set(userId, { ...session, ...updates });
  saveSessionsToDisk();
}

export function clearSession(userId: string) {
  sessions.delete(userId);
  saveSessionsToDisk();
}

export function countCoreActiveArgs(filters: PropertyFilters): number {
  const coreValues = [
    filters.city,
    filters.maxPrice,
    filters.beds,
    filters.baths,
    filters.type,
    filters.pool,
  ];
  return coreValues.filter((value) => value !== null && value !== undefined).length;
}

export function mergeSessionWithParsedFilters(
  session: UserSession,
  parsed: PropertyFilters,
): PropertyFilters {
  return {
    city: parsed.city ?? session.city ?? null,
    maxPrice: parsed.maxPrice ?? session.maxPrice ?? null,
    maxHoa: parsed.maxHoa ?? session.maxHoa ?? null,
    beds: parsed.beds ?? session.beds ?? null,
    baths: parsed.baths ?? session.baths ?? null,
    sqft: parsed.sqft ?? session.sqft ?? null,
    type: parsed.type ?? session.type ?? null,
    pool: parsed.pool ?? session.pool ?? null,
    hasView: parsed.hasView ?? session.hasView ?? null,
  };
}

export function buildNarrowingPrompt(filters: PropertyFilters): string {
  const known = [
    filters.city ? `city: ${filters.city}` : null,
    filters.maxPrice !== null ? `max price: $${filters.maxPrice.toLocaleString()}` : null,
    filters.beds !== null ? `beds: ${filters.beds}+` : null,
    filters.baths !== null ? `baths: ${filters.baths}+` : null,
    filters.type ? `type: ${filters.type}` : null,
    filters.pool ? `pool: ${filters.pool}` : null,
  ].filter(Boolean);

  const knownText = known.length ? `I have ${known.join(", ")}.` : "I only have one filter so far.";
  return (
    `${knownText} ` +
    "Would you like to narrow the search with price, beds/baths, property type, pool, sqft, or HOA?"
  );
}
