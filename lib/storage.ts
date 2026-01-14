import fs from "fs";
import path from "path";
import { Readable } from "stream";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function getUploadDir(sessionId: string, jobId: string): string {
  const dir = path.join(UPLOADS_DIR, sessionId, jobId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "videos"), { recursive: true });
    fs.mkdirSync(path.join(dir, "thumbnails"), { recursive: true });
  }
  return dir;
}

export async function saveFile(file: File, destination: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return destination;
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function getFileStream(filePath: string): Readable {
  return fs.createReadStream(filePath);
}

export function deleteUploadDir(sessionId: string, jobId: string): void {
  const dir = path.join(UPLOADS_DIR, sessionId, jobId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

