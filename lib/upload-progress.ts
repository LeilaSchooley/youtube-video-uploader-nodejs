// In-memory store for upload progress tracking
// Used to track file copying progress during CSV uploads

export interface UploadProgress {
  sessionId: string;
  totalFiles: number;
  currentFile: number;
  currentFileName: string;
  status: 'copying' | 'completed' | 'error';
  message: string;
  copyStats?: {
    videosCopied: number;
    videosSkipped: number;
    thumbnailsCopied: number;
    thumbnailsSkipped: number;
    errors: string[];
  };
}

const progressStore = new Map<string, UploadProgress>();

export function setUploadProgress(sessionId: string, progress: UploadProgress): void {
  progressStore.set(sessionId, progress);
}

export function getUploadProgress(sessionId: string): UploadProgress | undefined {
  return progressStore.get(sessionId);
}

export function deleteUploadProgress(sessionId: string): void {
  progressStore.delete(sessionId);
}

// Clean up old progress entries (older than 1 hour)
export function cleanupOldProgress(): void {
  // For now, we'll rely on the client to clean up after completion
  // In production, you might want to add timestamps and auto-cleanup
}





