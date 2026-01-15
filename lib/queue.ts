import fs from "fs";
import path from "path";

export interface QueueItem {
  id: string;
  sessionId: string; // Keep for backward compatibility
  userId?: string; // Google user email/ID - persistent across sessions
  csvPath: string;
  uploadDir: string;
  videosPerDay: number; // Deprecated: use uploadInterval and videosPerInterval instead
  startDate: string;
  uploadInterval?: "day" | "hour" | "12hours" | "6hours" | "30mins" | "10mins" | "custom"; // Upload frequency
  videosPerInterval?: number; // Number of videos per interval (e.g., 10 videos per hour)
  customIntervalMinutes?: number; // Custom interval in minutes (only used when uploadInterval is "custom")
  status: "pending" | "processing" | "completed" | "failed" | "paused" | "cancelled";
  progress: Array<{ 
    index: number; 
    status: string; 
    videoId?: string; // YouTube video ID for linking
    fileSize?: number; // File size in bytes
    duration?: number; // Video duration in seconds
    uploadSpeed?: number; // Upload speed in bytes per second
  }>;
  totalVideos?: number; // Total number of videos in this job
  notes?: string; // User notes/comments for this job
  createdAt: string;
  updatedAt: string;
}

const QUEUE_FILE = path.join(process.cwd(), "data", "queue.json");
const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readQueue(): QueueItem[] {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = fs.readFileSync(QUEUE_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading queue:", error);
  }
  return [];
}

// Debounce queue writes to avoid excessive disk I/O for large jobs
let writeQueueTimeout: NodeJS.Timeout | null = null;
const QUEUE_WRITE_DEBOUNCE_MS = 1000; // Wait 1 second before writing

function writeQueue(queue: QueueItem[]): void {
  try {
    // Clear existing timeout
    if (writeQueueTimeout) {
      clearTimeout(writeQueueTimeout);
    }
    
    // Debounce writes - only write after 1 second of no updates
    writeQueueTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
        writeQueueTimeout = null;
      } catch (error) {
        console.error("Error writing queue:", error);
      }
    }, QUEUE_WRITE_DEBOUNCE_MS);
  } catch (error) {
    console.error("Error scheduling queue write:", error);
  }
}

// Force immediate write (for critical operations)
function writeQueueImmediate(queue: QueueItem[]): void {
  try {
    // Clear any pending debounced write
    if (writeQueueTimeout) {
      clearTimeout(writeQueueTimeout);
      writeQueueTimeout = null;
    }
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  } catch (error) {
    console.error("Error writing queue:", error);
  }
}

export function addToQueue(item: Omit<QueueItem, "id" | "status" | "progress" | "createdAt" | "updatedAt">): string {
  const queue = readQueue();
  const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const queueItem: QueueItem = {
    ...item,
    id,
    status: "pending",
    progress: [],
    totalVideos: item.totalVideos,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  queue.push(queueItem);
  writeQueueImmediate(queue); // Immediate write for new jobs
  return id;
}

export function getQueue(): QueueItem[] {
  return readQueue();
}

export function getQueueItem(id: string): QueueItem | undefined {
  const queue = readQueue();
  return queue.find(item => item.id === id);
}

export function updateQueueItem(id: string, updates: Partial<QueueItem>, immediate: boolean = false): void {
  const queue = readQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index !== -1) {
    queue[index] = {
      ...queue[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    // Use immediate write for status changes (pending -> processing -> completed)
    // Use debounced write for progress updates (frequent)
    if (immediate || updates.status) {
      writeQueueImmediate(queue);
    } else {
      writeQueue(queue);
    }
  }
}

export function getNextPendingItem(): QueueItem | undefined {
  const queue = readQueue();
  return queue.find(item => item.status === "pending");
}

export function pauseJob(id: string): void {
  const item = getQueueItem(id);
  if (item && (item.status === "pending" || item.status === "processing")) {
    updateQueueItem(id, { status: "paused" });
  }
}

export function resumeJob(id: string): void {
  const item = getQueueItem(id);
  if (item && item.status === "paused") {
    updateQueueItem(id, { status: "pending" });
  }
}

export function cancelJob(id: string): void {
  const queue = readQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index !== -1) {
    const item = queue[index];
    // Only allow cancellation of pending or paused jobs
    if (item.status === "pending" || item.status === "paused") {
      // Remove from queue
      queue.splice(index, 1);
      writeQueue(queue);
    }
  }
}

export function deleteJob(id: string): void {
  const queue = readQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index !== -1) {
    const item = queue[index];
    // Allow deletion of completed or failed jobs
    if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") {
      // Remove from queue
      queue.splice(index, 1);
      writeQueue(queue);
      console.log(`[QUEUE] Deleted ${item.status} job: ${id}`);
    } else {
      throw new Error(`Cannot delete job with status: ${item.status}. Only completed, failed, or cancelled jobs can be deleted.`);
    }
  } else {
    throw new Error(`Job not found: ${id}`);
  }
}

export function markAsProcessing(id: string): void {
  updateQueueItem(id, { status: "processing" });
}

export function markAsCompleted(id: string): void {
  updateQueueItem(id, { status: "completed" });
}

export function markAsFailed(id: string, error: string): void {
  updateQueueItem(id, { status: "failed" });
}

export function updateProgress(id: string, progress: Array<{ index: number; status: string }>): void {
  updateQueueItem(id, { progress });
  // Debug logging for progress updates
  const completed = progress.filter(p => 
    p.status.includes("Uploaded") || 
    p.status.includes("Scheduled") || 
    p.status.includes("scheduled") ||
    p.status.includes("Already uploaded")
  ).length;
  const failed = progress.filter(p => 
    p.status.includes("Failed") || 
    p.status.includes("Missing") ||
    p.status.includes("Invalid") ||
    p.status.includes("not found") ||
    p.status.includes("Cannot access")
  ).length;
  const processing = progress.filter(p => 
    p.status.includes("Uploading") || 
    p.status === "Pending" ||
    p.status.includes("Checking")
  ).length;
  console.log(`[QUEUE] [${new Date().toISOString()}] Progress updated for ${id}: ${completed} completed, ${failed} failed, ${processing} processing, ${progress.length} total`);
}

export function deleteAllCompletedJobs(userId?: string, sessionId?: string): { deleted: number; errors: string[] } {
  const queue = readQueue();
  const errors: string[] = [];
  let deleted = 0;
  
  // Filter jobs that can be deleted (completed, failed, cancelled)
  const jobsToDelete = queue.filter(item => {
    const canDelete = item.status === "completed" || item.status === "failed" || item.status === "cancelled";
    // If userId/sessionId provided, only delete jobs belonging to that user
    if (userId || sessionId) {
      const belongsToUser = (userId && item.userId === userId) || 
                           (!item.userId && sessionId && item.sessionId === sessionId);
      return canDelete && belongsToUser;
    }
    return canDelete;
  });
  
  // Remove jobs from queue
  const updatedQueue = queue.filter(item => !jobsToDelete.includes(item));
  writeQueue(updatedQueue);
  deleted = jobsToDelete.length;
  
  console.log(`[QUEUE] Deleted ${deleted} completed/failed/cancelled job(s)`);
  
  return { deleted, errors };
}

