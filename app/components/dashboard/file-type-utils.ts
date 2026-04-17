const VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".flv",
  ".wmv",
  ".m4v",
] as const;

const SPREADSHEET_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;

export function isVideoFileName(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export function isSpreadsheetFileName(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return SPREADSHEET_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}
