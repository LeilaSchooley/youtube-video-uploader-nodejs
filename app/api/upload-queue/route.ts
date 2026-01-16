import { NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getOAuthClient } from "@/lib/auth";
import { google } from "googleapis";
import { Readable } from "stream";
import csvParser from "csv-parser";
import { parseDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 1800; // 30 minutes for large batches
export const runtime = 'nodejs';

interface CSVRow {
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_path?: string;
  path?: string;
  scheduleTime?: string;
  privacyStatus?: string;
}

interface VideoUploadTask {
  index: number;
  row: CSVRow;
  videoFile: File | null;
  thumbnailFile: File | null;
}

interface BatchProgress {
  batchNumber: number;
  totalBatches: number;
  batchSize: number;
  completed: number;
  failed: number;
  total: number;
  currentBatch: Array<{
    index: number;
    title: string;
    status: 'uploading' | 'success' | 'failed';
    videoId?: string;
    error?: string;
  }>;
}

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

/**
 * Upload a single video to YouTube
 */
async function uploadVideo(
  youtube: ReturnType<typeof google.youtube>,
  task: VideoUploadTask,
  sendProgress: (data: any) => void
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const { row, videoFile, thumbnailFile } = task;
  const { youtube_title, youtube_description, scheduleTime, privacyStatus } = row;

  if (!youtube_title || !youtube_description) {
    return { 
      success: false, 
      error: 'Missing required fields: youtube_title or youtube_description' 
    };
  }

  if (!videoFile) {
    return { 
      success: false, 
      error: 'Video file not found' 
    };
  }

  try {
    // Determine publish date
    let publishDate: Date | null = null;
    if (scheduleTime) {
      publishDate = parseDate(scheduleTime);
      if (!publishDate) {
        return { 
          success: false, 
          error: 'Invalid scheduleTime format' 
        };
      }
    }

    const finalPrivacyStatus = privacyStatus || "public";
    if (!["public", "private", "unlisted"].includes(finalPrivacyStatus)) {
      return { 
        success: false, 
        error: 'Invalid privacyStatus' 
      };
    }

    // Upload as private if scheduling, otherwise use finalPrivacyStatus
    const uploadPrivacyStatus = publishDate ? "private" : finalPrivacyStatus;

    const requestBody: {
      snippet: { title: string; description: string };
      status: { privacyStatus: string; publishAt?: string };
    } = {
      snippet: {
        title: youtube_title,
        description: youtube_description,
      },
      status: { privacyStatus: uploadPrivacyStatus },
    };

    if (publishDate) {
      requestBody.status.publishAt = publishDate.toISOString();
    }

    // Stream video file directly to YouTube
    sendProgress({
      type: 'video_upload_start',
      index: task.index,
      title: youtube_title.substring(0, 50),
    });

    const videoBytes = await videoFile.arrayBuffer();
    const videoBuffer = Buffer.from(videoBytes);
    const videoStream = Readable.from(videoBuffer);

    const uploadStartTime = Date.now();
    const resultVideoUpload = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody,
      media: { body: videoStream },
    });

    const videoId = resultVideoUpload.data.id || undefined;
    const uploadDuration = (Date.now() - uploadStartTime) / 1000;

    if (!videoId) {
      return { 
        success: false, 
        error: 'Upload succeeded but no video ID returned' 
      };
    }

    sendProgress({
      type: 'video_upload_success',
      index: task.index,
      title: youtube_title.substring(0, 50),
      videoId,
      duration: uploadDuration,
    });

    // Upload thumbnail if provided
    if (thumbnailFile && videoId) {
      sendProgress({
        type: 'thumbnail_upload_start',
        index: task.index,
        videoId,
      });

      try {
        const thumbnailBytes = await thumbnailFile.arrayBuffer();
        const thumbnailBuffer = Buffer.from(thumbnailBytes);
        const thumbnailStream = Readable.from(thumbnailBuffer);

        await youtube.thumbnails.set({
          videoId: videoId,
          media: { body: thumbnailStream },
        });

        sendProgress({
          type: 'thumbnail_upload_success',
          index: task.index,
          videoId,
        });
      } catch (thumbError: any) {
        console.error(`[UPLOAD-QUEUE] Thumbnail upload failed for video ${task.index}:`, thumbError);
        // Don't fail the whole upload if thumbnail fails
        sendProgress({
          type: 'thumbnail_upload_failed',
          index: task.index,
          videoId,
          error: thumbError?.message || 'Unknown error',
        });
      }
    }

    // Update privacy status if needed (only if we uploaded as private for scheduling)
    if (
      uploadPrivacyStatus === "private" &&
      finalPrivacyStatus !== "private" &&
      videoId &&
      publishDate
    ) {
      try {
        await youtube.videos.update({
          part: ["status"],
          requestBody: {
            id: videoId,
            status: {
              privacyStatus: finalPrivacyStatus,
              publishAt: requestBody.status.publishAt,
            },
          },
        });
      } catch (updateError: any) {
        console.error(`[UPLOAD-QUEUE] Privacy update failed for video ${task.index}:`, updateError);
        // Don't fail - video is uploaded, just privacy might be wrong
      }
    }

    return { success: true, videoId };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        'Unknown error';
    
    sendProgress({
      type: 'video_upload_failed',
      index: task.index,
      title: youtube_title?.substring(0, 50) || 'Unknown',
      error: errorMessage,
    });

    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

/**
 * Process a batch of videos
 */
async function processBatch(
  youtube: ReturnType<typeof google.youtube>,
  batch: VideoUploadTask[],
  batchNumber: number,
  totalBatches: number,
  sendProgress: (data: any) => void
): Promise<BatchProgress> {
  sendProgress({
    type: 'batch_start',
    batchNumber,
    totalBatches,
    batchSize: batch.length,
  });

  const results = await Promise.allSettled(
    batch.map(task => uploadVideo(youtube, task, sendProgress))
  );

  const completed = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

  const currentBatch = batch.map((task, i) => {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.success) {
      return {
        index: task.index,
        title: task.row.youtube_title?.substring(0, 50) || 'Unknown',
        status: 'success' as const,
        videoId: result.value.videoId,
      };
    } else {
      return {
        index: task.index,
        title: task.row.youtube_title?.substring(0, 50) || 'Unknown',
        status: 'failed' as const,
        error: result.status === 'fulfilled' 
          ? result.value.error 
          : result.reason?.message || 'Unknown error',
      };
    }
  });

  sendProgress({
    type: 'batch_complete',
    batchNumber,
    totalBatches,
    completed,
    failed,
    total: batch.length,
    currentBatch,
  });

  return {
    batchNumber,
    totalBatches,
    batchSize: batch.length,
    completed,
    failed,
    total: batch.length,
    currentBatch,
  };
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

  // Get userId from session (or fetch if not stored)
  let userId = session.userId;
  if (!userId) {
    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);
    const oauth2 = google.oauth2({
      version: "v2",
      auth: oAuthClient,
    });
    const userInfo = await oauth2.userinfo.get();
    userId = (userInfo.data.email || userInfo.data.id || undefined) as string | undefined;
    session.userId = userId;
    setSession(sessionId, session);
  }

  const formData = await request.formData();
  const csvFile = formData.get("csvFile") as File | null;
  const batchSize = parseInt(formData.get("batchSize") as string || "5", 10); // Default: 5 videos per batch

  if (!csvFile) {
    return new Response(
      JSON.stringify({ error: "No CSV file uploaded" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get uploaded video files
  const uploadedFiles: File[] = [];
  const filesArray = formData.getAll("files") as (File | string)[];
  for (const file of filesArray) {
    if (file instanceof File && file.type.startsWith('video/')) {
      uploadedFiles.push(file);
    }
  }
  const videoFilesArray = formData.getAll("videoFiles") as (File | string)[];
  for (const file of videoFilesArray) {
    if (file instanceof File && file.type.startsWith('video/')) {
      uploadedFiles.push(file);
    }
  }

  // Get uploaded thumbnail files
  const uploadedThumbnails: File[] = [];
  const thumbnailsArray = formData.getAll("thumbnails") as (File | string)[];
  for (const file of thumbnailsArray) {
    if (file instanceof File && (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
      uploadedThumbnails.push(file);
    }
  }
  const thumbnailFilesArray = formData.getAll("thumbnailFiles") as (File | string)[];
  for (const file of thumbnailFilesArray) {
    if (file instanceof File && (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
      uploadedThumbnails.push(file);
    }
  }

  console.log(`[UPLOAD-QUEUE] Received CSV + ${uploadedFiles.length} video(s) + ${uploadedThumbnails.length} thumbnail(s), batch size: ${batchSize}`);

  // Parse CSV
  const csvData: CSVRow[] = [];
  const bytes = await csvFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const csvStream = Readable.from(buffer);

  try {
    await new Promise<void>((resolve, reject) => {
      csvStream
        .pipe(csvParser())
        .on("data", (row: CSVRow) => {
          csvData.push(row);
        })
        .on("end", () => {
          console.log(`[UPLOAD-QUEUE] CSV parsed: ${csvData.length} rows`);
          resolve();
        })
        .on("error", (err) => {
          reject(new Error(`Failed to parse CSV: ${err.message}`));
        });
    });
  } catch (parseError: any) {
    return new Response(
      JSON.stringify({ error: `CSV parsing failed: ${parseError?.message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (csvData.length === 0) {
    return new Response(
      JSON.stringify({ error: "CSV file is empty" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Helper functions for filename matching
  const normalizeFilename = (filename: string): string => {
    if (!filename) return '';
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const extractFilename = (filePath: string): string => {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.split('/').pop()?.toLowerCase() || '';
  };

  const findMatchingFile = (
    csvFilename: string,
    fileMap: Map<string, File>
  ): File | null => {
    const lowerCsvFilename = csvFilename.toLowerCase();
    const normalizedCsvFilename = normalizeFilename(csvFilename);
    
    if (fileMap.has(lowerCsvFilename)) {
      return fileMap.get(lowerCsvFilename) || null;
    }
    
    if (fileMap.has(normalizedCsvFilename)) {
      return fileMap.get(normalizedCsvFilename) || null;
    }
    
    for (const [uploadedFilename, file] of Array.from(fileMap.entries())) {
      const normalizedUploaded = normalizeFilename(uploadedFilename);
      const csvCore = normalizedCsvFilename.replace(/\.(mp4|mov|avi|mkv)$/i, '');
      const uploadedCore = normalizedUploaded.replace(/\.(mp4|mov|avi|mkv)$/i, '');
      
      if (csvCore === uploadedCore || 
          (csvCore.length > 10 && uploadedCore.includes(csvCore)) ||
          (uploadedCore.length > 10 && csvCore.includes(uploadedCore))) {
        return file || null;
      }
    }
    
    return null;
  };

  // Create file maps
  const uploadedFilesMap = new Map<string, File>();
  uploadedFiles.forEach(file => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedFilesMap.set(filename, file);
    if (normalized !== filename) {
      uploadedFilesMap.set(normalized, file);
    }
  });

  const uploadedThumbnailsMap = new Map<string, File>();
  uploadedThumbnails.forEach(file => {
    const filename = file.name.toLowerCase();
    const normalized = normalizeFilename(file.name);
    uploadedThumbnailsMap.set(filename, file);
    if (normalized !== filename) {
      uploadedThumbnailsMap.set(normalized, file);
    }
  });

  // Setup YouTube API client
  const oAuthClient = getOAuthClient();
  oAuthClient.setCredentials(session.tokens);
  const youtube = google.youtube({
    version: "v3",
    auth: oAuthClient,
  });

  // Create upload tasks
  const tasks: VideoUploadTask[] = [];
  for (let i = 0; i < csvData.length; i++) {
    const row = csvData[i];
    const csvVideoFilename = row.path ? extractFilename(row.path) : '';
    const csvThumbFilename = row.thumbnail_path ? extractFilename(row.thumbnail_path) : '';
    
    const videoFile = csvVideoFilename ? findMatchingFile(csvVideoFilename, uploadedFilesMap) : null;
    const thumbnailFile = csvThumbFilename ? findMatchingFile(csvThumbFilename, uploadedThumbnailsMap) : null;

    tasks.push({
      index: i,
      row,
      videoFile,
      thumbnailFile,
    });
  }

  // Filter out tasks without video files
  const validTasks = tasks.filter(t => t.videoFile !== null);
  const invalidCount = tasks.length - validTasks.length;

  if (validTasks.length === 0) {
    return new Response(
      JSON.stringify({ error: "No matching video files found" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create batches
  const batches: VideoUploadTask[][] = [];
  for (let i = 0; i < validTasks.length; i += batchSize) {
    batches.push(validTasks.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;

  // Return streaming response with progress updates
  const stream = createProgressStream(async (send) => {
    send({
      type: 'start',
      total: validTasks.length,
      totalBatches,
      batchSize,
      invalidCount,
    });

    let totalCompleted = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchProgress = await processBatch(
        youtube,
        batch,
        i + 1,
        totalBatches,
        send
      );

      totalCompleted += batchProgress.completed;
      totalFailed += batchProgress.failed;

      send({
        type: 'overall_progress',
        totalCompleted,
        totalFailed,
        total: validTasks.length,
        progress: Math.round((totalCompleted + totalFailed) / validTasks.length * 100),
      });
    }

    send({
      type: 'final',
      totalCompleted,
      totalFailed,
      total: validTasks.length,
      invalidCount,
    });
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Keep GET endpoint for queue status (if needed)
export async function GET(request: NextRequest) {
  // Return empty queue since we're not using it anymore
  return new Response(
    JSON.stringify({ queue: [] }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
