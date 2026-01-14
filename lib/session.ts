// Simple in-memory session store for Next.js
// In production, consider using Redis or a database-backed session store

interface SessionData {
  authenticated: boolean;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    [key: string]: any;
  };
}

const sessions = new Map<string, SessionData>();

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, data: SessionData): void {
  sessions.set(sessionId, data);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

