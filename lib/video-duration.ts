/**
 * Get video duration using ffprobe (from ffmpeg).
 * Requires ffprobe to be installed on the system.
 * Works with local file paths only.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

export async function getVideoDurationSeconds(
  filePath: string,
): Promise<number | null> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      filePath,
    ]);
    const data = JSON.parse(stdout);
    const duration = data?.format?.duration;
    return typeof duration === "number" ? duration : null;
  } catch {
    return null;
  }
}
