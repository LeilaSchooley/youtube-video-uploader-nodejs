/**
 * Drive ID helpers safe for client components (no googleapis / Node builtins).
 */

export function isDriveFileId(str: string): boolean {
  return /^[a-zA-Z0-9_-]{25,}$/.test(str);
}

/** Extract a Drive file or folder ID from a share URL or raw id. */
export function parseDriveIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isDriveFileId(trimmed)) return trimmed;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1] && isDriveFileId(m[1])) return m[1];
  }
  return null;
}
