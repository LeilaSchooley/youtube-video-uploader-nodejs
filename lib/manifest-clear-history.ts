import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "manifest-clear-pending-history.json");

export interface ClearedManifestRecord {
  fromPath: string;
  toPath: string;
}

interface StoredHistory {
  [queueRoot: string]: {
    clearedAt: string;
    records: ClearedManifestRecord[];
  };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory(): StoredHistory {
  try {
    ensureDataDir();
    if (!fs.existsSync(FILE_PATH)) return {};
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredHistory;
  } catch {
    return {};
  }
}

function writeHistory(history: StoredHistory): void {
  ensureDataDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(history, null, 2), "utf8");
}

export function setLastClearedPending(
  queueRoot: string,
  records: ClearedManifestRecord[],
): void {
  const history = readHistory();
  history[queueRoot] = {
    clearedAt: new Date().toISOString(),
    records,
  };
  writeHistory(history);
}

export function getLastClearedPending(
  queueRoot: string,
): ClearedManifestRecord[] {
  const history = readHistory();
  return history[queueRoot]?.records ?? [];
}

export function clearLastClearedPending(queueRoot: string): void {
  const history = readHistory();
  if (!history[queueRoot]) return;
  delete history[queueRoot];
  writeHistory(history);
}
