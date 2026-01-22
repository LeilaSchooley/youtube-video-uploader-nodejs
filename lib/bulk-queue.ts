import fs from "fs";
import path from "path";

export interface BulkUploadItem {
  id: string;
  sessionId: string;
  userId?: string;
  type: "files" | "urls"; // Whether this is file-based or URL-based upload
  videosPerDay?: number; // Number of videos to upload per day (0 = upload all immediately)
  startDate?: string; // Start date for scheduling (ISO string)
  items: Array<{
    // For file-based uploads
    file?: {
      name: string;
      path?: string; // Server path if file is on server
    };
    // For URL-based uploads
    url?: string;
    // For Drive-based uploads
    driveFileId?: string;
    driveThumbnailId?: string;
    authHeaders?: Record<string, string>; // Optional auth headers for URL
    timeout?: number; // Optional timeout override
    // Common metadata
    title?: string;
    description?: string;
    privacyStatus?: "public" | "private" | "unlisted";
    publishDate?: string; // ISO date string
    thumbnailUrl?: string;
    thumbnailPath?: string;
    // Post-upload actions
    postUploadAction?: string; // "rename", "delete", "move", or "none"
    completedFolderId?: string; // Drive folder ID for move action
    // YouTube settings
    madeForKids?: boolean; // Self-declared "Made for Kids" status (default: false)
  }>;
  status: "pending" | "processing" | "completed" | "failed" | "paused" | "cancelled";
  progress: Array<{
    index: number;
    status: string;
    videoId?: string;
    error?: string;
    title?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

const BULK_QUEUE_FILE = path.join(process.cwd(), "data", "bulk-queue.json");
const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readBulkQueue(): BulkUploadItem[] {
  try {
    if (fs.existsSync(BULK_QUEUE_FILE)) {
      const data = fs.readFileSync(BULK_QUEUE_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading bulk queue:", error);
  }
  return [];
}

// Debounce queue writes
let writeQueueTimeout: NodeJS.Timeout | null = null;
const QUEUE_WRITE_DEBOUNCE_MS = 1000;

function writeBulkQueue(queue: BulkUploadItem[]): void {
  try {
    if (writeQueueTimeout) {
      clearTimeout(writeQueueTimeout);
    }
    
    writeQueueTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(BULK_QUEUE_FILE, JSON.stringify(queue, null, 2));
        writeQueueTimeout = null;
      } catch (error) {
        console.error("Error writing bulk queue:", error);
      }
    }, QUEUE_WRITE_DEBOUNCE_MS);
  } catch (error) {
    console.error("Error scheduling bulk queue write:", error);
  }
}

function writeBulkQueueImmediate(queue: BulkUploadItem[]): void {
  try {
    if (writeQueueTimeout) {
      clearTimeout(writeQueueTimeout);
      writeQueueTimeout = null;
    }
    fs.writeFileSync(BULK_QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error("Error writing bulk queue:", error);
  }
}

export function addToBulkQueue(
  item: Omit<BulkUploadItem, "id" | "status" | "progress" | "createdAt" | "updatedAt">
): string {
  const queue = readBulkQueue();
  const id = `bulk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const queueItem: BulkUploadItem = {
    ...item,
    id,
    status: "pending",
    progress: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  queue.push(queueItem);
  writeBulkQueueImmediate(queue);
  return id;
}

export function getBulkQueue(): BulkUploadItem[] {
  return readBulkQueue();
}

export function getBulkQueueItem(id: string): BulkUploadItem | undefined {
  const queue = readBulkQueue();
  return queue.find(item => item.id === id);
}

export function updateBulkQueueItem(
  id: string,
  updates: Partial<BulkUploadItem>,
  immediate: boolean = false
): void {
  const queue = readBulkQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index !== -1) {
    queue[index] = {
      ...queue[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (immediate || updates.status) {
      writeBulkQueueImmediate(queue);
    } else {
      writeBulkQueue(queue);
    }
  }
}

export function getNextPendingBulkItem(): BulkUploadItem | undefined {
  const queue = readBulkQueue();
  return queue.find(item => item.status === "pending");
}

export function markBulkAsProcessing(id: string): void {
  updateBulkQueueItem(id, { status: "processing" });
}

export function markBulkAsCompleted(id: string): void {
  updateBulkQueueItem(id, { status: "completed" });
}

export function markBulkAsFailed(id: string, error: string): void {
  updateBulkQueueItem(id, { status: "failed", error });
}

export function updateBulkProgress(
  id: string,
  progress: Array<{ index: number; status: string; videoId?: string; error?: string }>,
  immediate: boolean = false
): void {
  updateBulkQueueItem(id, { progress }, immediate);
}

export function deleteAllBulkJobs(userId?: string, sessionId?: string): { deleted: number; errors: string[] } {
  const queue = readBulkQueue();
  const errors: string[] = [];
  let deleted = 0;
  
  // Filter jobs belonging to user (if userId/sessionId provided)
  const jobsToDelete = queue.filter(item => {
    if (userId || sessionId) {
      const belongsToUser = (userId && item.userId === userId) || 
                           (!item.userId && sessionId && item.sessionId === sessionId);
      return belongsToUser;
    }
    return true; // Delete all if no filter
  });
  
  // Remove jobs from queue
  const updatedQueue = queue.filter(item => !jobsToDelete.includes(item));
  writeBulkQueueImmediate(updatedQueue);
  deleted = jobsToDelete.length;
  
  console.log(`[BULK-QUEUE] Deleted ${deleted} job(s)`);
  
  return { deleted, errors };
}
