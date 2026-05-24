/** Persist Google Drive OAuth tokens by Google userId (survives logout/login). */

import fs from "fs";
import path from "path";
import type { DriveTokenSet } from "@/lib/auth-drive";

export type DriveTokensForUser = DriveTokenSet;

const FILE_PATH = path.join(process.cwd(), "data", "drive-by-user.json");
const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): Record<string, DriveTokensForUser> {
  ensureDataDir();
  try {
    if (fs.existsSync(FILE_PATH)) {
      return JSON.parse(fs.readFileSync(FILE_PATH, "utf8")) as Record<
        string,
        DriveTokensForUser
      >;
    }
  } catch (e) {
    console.error("[DRIVE-BY-USER] Error reading store:", e);
  }
  return {};
}

function writeStore(store: Record<string, DriveTokensForUser>): void {
  ensureDataDir();
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[DRIVE-BY-USER] Error writing store:", e);
  }
}

export function getDriveTokensForUser(
  userId: string,
): DriveTokensForUser | undefined {
  if (!userId?.trim()) return undefined;
  return readStore()[userId];
}

export function getDriveTokensForCandidates(
  ids: Array<string | undefined | null>,
): DriveTokensForUser | undefined {
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const t = getDriveTokensForUser(id);
    if (t?.access_token || t?.refresh_token) return t;
  }
  return undefined;
}

export function setDriveTokensForUser(
  userId: string,
  tokens: DriveTokensForUser,
): void {
  if (!userId?.trim()) return;
  const store = readStore();
  store[userId] = tokens;
  writeStore(store);
}

export function clearDriveTokensForUser(userId: string): void {
  if (!userId?.trim()) return;
  const store = readStore();
  if (!(userId in store)) return;
  delete store[userId];
  writeStore(store);
}
