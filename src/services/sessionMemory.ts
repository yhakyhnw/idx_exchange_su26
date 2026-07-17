import { ListingRow } from "../types/Week3Rows";

export interface UserSession {
  city?: string;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  type?: string;
  pool?: string;
  lastResults?: ListingRow[];
  conversationStep: number;
}

const sessions = new Map<string, UserSession>();

export function getSession(userId: string): UserSession {
  if (!sessions.has(userId)) {
    sessions.set(userId, { conversationStep: 0 });
  }
  return sessions.get(userId)!;
}

export function updateSession(userId: string, updates: Partial<UserSession>) {
  const session = getSession(userId);
  sessions.set(userId, { ...session, ...updates });
}

export function clearSession(userId: string) {
  sessions.delete(userId);
}

export function getAllSessions(): Array<{ userId: string; session: UserSession }> {
  return Array.from(sessions.entries()).map(([userId, session]) => ({ userId, session }));
}
