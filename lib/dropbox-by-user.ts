// Persist Dropbox tokens by userId so they survive logout/login (same Google account)

import fs from "fs";
import path from "path";

export interface DropboxTokensForUser {
  dropboxToken: string;
  dropboxRefreshToken?: string;
}

const FILE_PATH = path.join(process.cwd(), "data", "dropbox-by-user.json");
const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): Record<string, DropboxTokensForUser> {
  ensureDataDir();
  try {
    if (fs.existsSync(FILE_PATH)) {
      const data = fs.readFileSync(FILE_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("[DROPBOX-BY-USER] Error reading store:", e);
  }
  return {};
}

function writeStore(store: Record<string, DropboxTokensForUser>): void {
  ensureDataDir();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[DROPBOX-BY-USER] Error writing store:", e);
  }
}

export function getDropboxTokensForUser(
  userId: string,
): DropboxTokensForUser | undefined {
  if (!userId || typeof userId !== "string") return undefined;
  const store = readStore();
  return store[userId];
}

export function setDropboxTokensForUser(
  userId: string,
  tokens: DropboxTokensForUser,
): void {
  if (!userId || typeof userId !== "string") return;
  const store = readStore();
  store[userId] = tokens;
  writeStore(store);
}
