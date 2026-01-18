import { NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";

export const dynamic = 'force-dynamic';
export const maxDuration = 3600; // 60 minutes for large bulk uploads
export const runtime = 'nodejs';

const BATCH_SIZE = 5;

function createProgressStream(
  callback: (send: (data: any) => void) => Promise<void>
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const send = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        await callback(send);
        controller.close();
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        send({ type: 'error', error: errorMessage });
        controller.error(error);
      }
    },
  });
}

interface UploadResult {
  filename: string;
  videoId?: string;
  success: boolean;
  error?: string;
}

async function uploadSingleVideo(
  youtube: ReturnType<typeof google.youtube>,
  file: File,
  sendProgress: (data: any) => void
): Promise<UploadResult> {
  const filename = file.name;
  
  try {
    sendProgress({
      type: 'upload_start',
      filename,
    });

    // Use filename (without extension) as title, set to private
    const title = filename.replace(/\.[^/.]+$/, ""); // Remove extension
    const description = `Uploaded: ${filename}`;

    const requestBody = {
      snippet: { title, description },
      status: { privacyStatus: "private" as const },
    };

    // Convert File to stream
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const videoStream = Readable.from(buffer);

    const uploadStartTime = Date.now();
    const result = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody,
      media: { body: videoStream },
    });

    const videoId = result.data.id;
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (!videoId) {
      return {
        filename,
        success: false,
        error: 'Upload succeeded but no video ID returned',
      };
    }

    sendProgress({
      type: 'upload_success',
      filename,
      videoId,
      duration: uploadDuration,
    });

    return {
      filename,
      videoId,
      success: true,
    };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        'Unknown error';
    
    sendProgress({
      type: 'upload_failed',
      filename,
      error: errorMessage,
    });

    return {
      filename,
      success: false,
      error: errorMessage,
    };
  }
}

async function processBatch(
  youtube: ReturnType<typeof google.youtube>,
  batch: File[],
  batchNumber: number,
  totalBatches: number,
  sendProgress: (data: any) => void
): Promise<UploadResult[]> {
  sendProgress({
    type: 'batch_start',
    batchNumber,
    totalBatches,
    batchSize: batch.length,
  });

  // Process batch in parallel (up to 5 videos)
  const results = await Promise.allSettled(
    batch.map(file => uploadSingleVideo(youtube, file, sendProgress))
  );

  const uploadResults: UploadResult[] = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        filename: batch[index].name,
        success: false,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  const completed = uploadResults.filter(r => r.success).length;
  const failed = uploadResults.filter(r => !r.success).length;

  sendProgress({
    type: 'batch_complete',
    batchNumber,
    totalBatches,
    completed,
    failed,
    total: batch.length,
    results: uploadResults,
  });

  return uploadResults;
}

export async function POST(request: NextRequest) {
  try {
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

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files uploaded" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Filter to only video files
    const videoFiles = files.filter(file => 
      file.type.startsWith('video/') || 
      /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name)
    );

    if (videoFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No video files found" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    // Create batches
    const batches: File[][] = [];
    for (let i = 0; i < videoFiles.length; i += BATCH_SIZE) {
      batches.push(videoFiles.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;

    // Return streaming response with progress updates
    const stream = createProgressStream(async (send) => {
      send({
        type: 'start',
        total: videoFiles.length,
        totalBatches,
        batchSize: BATCH_SIZE,
      });

      let allResults: UploadResult[] = [];
      let totalCompleted = 0;
      let totalFailed = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchResults = await processBatch(
          youtube,
          batch,
          i + 1,
          totalBatches,
          send
        );

        allResults.push(...batchResults);
        totalCompleted += batchResults.filter(r => r.success).length;
        totalFailed += batchResults.filter(r => !r.success).length;

        send({
          type: 'progress',
          totalCompleted,
          totalFailed,
          total: videoFiles.length,
          completed: totalCompleted,
          failed: totalFailed,
        });
      }

      send({
        type: 'complete',
        totalCompleted,
        totalFailed,
        total: videoFiles.length,
        results: allResults,
      });
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error("=== BULK UPLOAD ERROR ===");
    console.error("Error:", error);
    console.error("Message:", error?.message);
    console.error("Stack:", error?.stack);
    console.error("=========================");
    
    return new Response(
      JSON.stringify({ 
        error: error?.message || "Error during bulk upload" 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

