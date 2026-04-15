export function formatFileSize(bytes?: number): string {
  if (!bytes) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatSpeed(bytesPerSecond?: number): string {
  if (!bytesPerSecond) return "";
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024)
    return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    const mins = minutes.toString().padStart(2, "0");
    const secsStr = secs.toString().padStart(2, "0");
    return `${hours}:${mins}:${secsStr}`;
  }
  const mins = minutes.toString().padStart(2, "0");
  const secsStr = secs.toString().padStart(2, "0");
  return `${mins}:${secsStr}`;
}
