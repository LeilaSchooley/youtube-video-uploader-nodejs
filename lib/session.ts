// Persistent file-based session store for Next.js
// Sessions are saved to disk to persist across server restarts

import fs from "fs";
import path from "path";

interface SessionData {
  authenticated: boolean;
  userId?: string; // Google user email/ID
  tokens?: {
    access_token?: string | null;
    refresh_token?: string | null;
    [key: string]: any;
  };
}

const SESSIONS_FILE = path.join(process.cwd(), "data", "sessions.json");
const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory cache for fast access
const sessionsCache = new Map<string, SessionData>();

// Load sessions from disk on startup
function loadSessions(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, "utf8");
      const sessions = JSON.parse(data);
      Object.entries(sessions).forEach(([id, sessionData]) => {
        sessionsCache.set(id, sessionData as SessionData);
      });
      console.log(`Loaded ${sessionsCache.size} sessions from disk`);
    }
  } catch (error) {
    console.error("Error loading sessions:", error);
  }
}

// Save sessions to disk
function saveSessions(): void {
  try {
    const sessions: Record<string, SessionData> = {};
    sessionsCache.forEach((data, id) => {
      sessions[id] = data;
    });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving sessions:", error);
  }
}

// Load sessions on module initialization
loadSessions();

export function getSession(sessionId: string): SessionData | undefined {
  return sessionsCache.get(sessionId);
}

export function setSession(sessionId: string, data: SessionData): void {
  sessionsCache.set(sessionId, data);
  saveSessions(); // Persist to disk
}

export function deleteSession(sessionId: string): void {
  sessionsCache.delete(sessionId);
  saveSessions(); // Persist to disk
}

export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Export sessions map for worker to access (in production, use a shared store like Redis)
export function getAllSessions(): Map<string, SessionData> {
  return sessionsCache;
}

