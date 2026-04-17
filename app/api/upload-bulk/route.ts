import { NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import { addToBulkQueue, getBulkQueueItem } from "@/lib/bulk-queue";
import { isValidUrl } from "@/lib/url-stream";
import { saveToStaging } from "@/lib/storage";
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Reduced since we're using worker
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
      status: { privacyStatus: "public" as const },
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

    // Get userId from session (optional; skip if userinfo scope not granted or token invalid)
    let userId = session.userId;
    if (!userId) {
      try {
        const oAuthClient = getOAuthClient();
        oAuthClient.setCredentials(session.tokens);
        const oauth2 = google.oauth2({
          version: "v2",
          auth: oAuthClient,
        });
        const userInfo = await oauth2.userinfo.get();
        userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
        if (userId) {
          session.userId = userId;
          setSession(sessionId, session);
        }
      } catch (err) {
        console.warn("[UPLOAD-BULK] Could not fetch Google userinfo. Proceeding without userId.", err);
      }
    }

    const formData = await request.formData();
    
    // Support both files and URLs
    const files = formData.getAll("files") as File[];
    const urls = formData.getAll("urls") as string[];
    const urlAuthHeaders = formData.get("urlAuthHeaders") as string | null; // JSON string of headers
    const urlTimeout = formData.get("urlTimeout") as string | null; // Timeout in ms
    const useWorker = formData.get("useWorker") !== "false"; // Default to true

    // Parse auth headers if provided
    let parsedAuthHeaders: Record<string, string> = {};
    if (urlAuthHeaders) {
      try {
        parsedAuthHeaders = JSON.parse(urlAuthHeaders);
      } catch (e) {
        console.warn("Failed to parse auth headers:", e);
      }
    }

    const timeout = urlTimeout ? parseInt(urlTimeout, 10) : undefined;

    // Validate inputs
    if ((!files || files.length === 0) && (!urls || urls.length === 0)) {
      return new Response(
        JSON.stringify({ error: "No files or URLs provided" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Filter video files
    const videoFiles = files.filter(file => 
      file.type.startsWith('video/') || 
      /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name)
    );

    // Filter valid URLs
    const validUrls = urls.filter(url => isValidUrl(url));

    if (videoFiles.length === 0 && validUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid video files or URLs found" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If useWorker is true, queue for background processing
    if (useWorker) {
      const queueItems: Array<{
        file?: { name: string; path?: string };
        url?: string;
        authHeaders?: Record<string, string>;
        timeout?: number;
        title?: string;
        description?: string;
        privacyStatus?: "public" | "private" | "unlisted";
        publishDate?: string;
        thumbnailUrl?: string;
        thumbnailPath?: string;
      }> = [];

      // Save files to disk and add to queue
      for (const file of videoFiles) {
        try {
          const savedFile = await saveToStaging(file, userId, sessionId, "video");
          queueItems.push({
            file: {
              name: savedFile.fileName,
              path: savedFile.filePath,
            },
          });
        } catch (error: any) {
          console.error(`Failed to save file ${file.name}:`, error);
          // Continue with other files
        }
      }

      // Add URLs
      for (const url of validUrls) {
        queueItems.push({
          url,
          authHeaders: Object.keys(parsedAuthHeaders).length > 0 ? parsedAuthHeaders : undefined,
          timeout,
        });
      }

      if (queueItems.length === 0) {
        return new Response(
          JSON.stringify({ error: "No valid items to queue" }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const jobId = addToBulkQueue({
        sessionId,
        userId,
        type: videoFiles.length > 0 && validUrls.length > 0 ? "files" : (validUrls.length > 0 ? "urls" : "files"),
        items: queueItems,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Upload queued for processing",
          jobId,
          totalItems: queueItems.length,
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Otherwise, process synchronously (original behavior for small uploads)
    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    // Process files synchronously (original code)
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

      const allResults: UploadResult[] = [];
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

// GET endpoint to check job status
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "jobId parameter required" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const job = getBulkQueueItem(jobId);
    if (!job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify job belongs to session
    if (job.sessionId !== sessionId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        totalItems: job.items.length,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Error fetching job status" }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

