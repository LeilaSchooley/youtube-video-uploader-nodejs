import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import AdmZip from "adm-zip";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 minutes for large ZIP files
export const runtime = 'nodejs';

/**
 * Stream progress updates as Server-Sent Events
 */
function createProgressStream(
  callback: (send: (data: any) => void) => Promise<void>
): ReadableStream {
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        await callback(send);
        send({ type: 'complete' });
      } catch (error: any) {
        send({ 
          type: 'error', 
          error: error?.message || 'Unknown error' 
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  
  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = getSession(sessionId);
  if (!session || !session.authenticated || !session.tokens) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get userId from session
  let userId = session.userId;
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "User ID not found in session" }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const formData = await request.formData();
  const zipFile = formData.get("zipFile") as File | null;

  if (!zipFile) {
    return new Response(
      JSON.stringify({ error: "No ZIP file uploaded" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!zipFile.name.toLowerCase().endsWith('.zip')) {
    return new Response(
      JSON.stringify({ error: "File must be a ZIP archive" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create progress stream
  return new Response(
    createProgressStream(async (send) => {
      try {
        send({
          type: 'start',
          message: 'Starting ZIP upload and extraction...',
          zipSize: zipFile.size,
        });

        // Read ZIP file
        send({
          type: 'progress',
          message: 'Reading ZIP file...',
          progress: 10,
        });

        const zipBuffer = await zipFile.arrayBuffer();
        const zip = new AdmZip(Buffer.from(zipBuffer));

        send({
          type: 'progress',
          message: 'Extracting ZIP file...',
          progress: 30,
        });

        // Get user's upload directory
        const uploadsDir = path.join(process.cwd(), "uploads");
        const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const userDir = path.join(uploadsDir, safeUserId);
        const assetsDir = path.join(userDir, "assets");

        // Ensure directories exist
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }

        // Extract ZIP
        const zipEntries = zip.getEntries();
        const totalFiles = zipEntries.length;
        let extractedCount = 0;
        let videoCount = 0;
        let thumbnailCount = 0;

        send({
          type: 'extracting',
          message: `Extracting ${totalFiles} files...`,
          progress: 40,
          totalFiles,
          extractedCount: 0,
        });

        // Extract files
        for (const entry of zipEntries) {
          if (entry.isDirectory) continue;

          const entryName = entry.entryName;
          const fileName = path.basename(entryName);
          
          // Determine file type
          const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(fileName);
          const isThumbnail = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);

          if (!isVideo && !isThumbnail) {
            extractedCount++;
            continue; // Skip non-media files
          }

          // Create subdirectories if needed
          const targetDir = isVideo 
            ? path.join(assetsDir, "videos")
            : path.join(assetsDir, "thumbnails");
          
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          // Extract file
          const targetPath = path.join(targetDir, fileName);
          const fileData = entry.getData();
          fs.writeFileSync(targetPath, fileData);

          extractedCount++;
          if (isVideo) videoCount++;
          if (isThumbnail) thumbnailCount++;

          // Send progress update every 10 files
          if (extractedCount % 10 === 0 || extractedCount === totalFiles) {
            const progress = 40 + Math.floor((extractedCount / totalFiles) * 50);
            send({
              type: 'extracting',
              message: `Extracted ${extractedCount}/${totalFiles} files...`,
              progress,
              totalFiles,
              extractedCount,
              videoCount,
              thumbnailCount,
            });
          }
        }

        send({
          type: 'success',
          message: `Successfully extracted ${extractedCount} files (${videoCount} videos, ${thumbnailCount} thumbnails)`,
          progress: 100,
          totalFiles: extractedCount,
          videoCount,
          thumbnailCount,
        });

      } catch (error: any) {
        console.error('[UPLOAD-ZIP] Error:', error);
        throw new Error(error?.message || 'Failed to extract ZIP file');
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  );
}

