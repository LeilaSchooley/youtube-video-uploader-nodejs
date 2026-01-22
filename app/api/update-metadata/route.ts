import { NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { Readable } from "stream";
import csvParser from "csv-parser";
import { parseDate } from "@/lib/utils";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes for metadata updates
export const runtime = 'nodejs';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

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

interface CSVRow {
  video_name?: string;
  youtube_title?: string;
  youtube_description?: string;
  thumbnail_name?: string;
  scheduleTime?: string;
  privacyStatus?: string;
}

interface VideoInfo {
  id: string;
  title: string;
  privacyStatus: string;
}

/**
 * Get all private videos for the authenticated user
 */
async function getPrivateVideos(
  youtube: ReturnType<typeof google.youtube>
): Promise<VideoInfo[]> {
  const videos: VideoInfo[] = [];
  let pageToken: string | undefined = undefined;

  while (true) {
    try {
      const listParams: {
        part: string[];
        myRating: string;
        maxResults: number;
        pageToken?: string;
      } = {
        part: ["snippet", "status"],
        myRating: "none", // Get videos we own
        maxResults: 50,
      };
      
      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      const response = await youtube.videos.list(listParams);

      if (response.data.items) {
        for (const item of response.data.items) {
          if (item.status?.privacyStatus === "private" && item.id) {
            videos.push({
              id: item.id,
              title: item.snippet?.title || "",
              privacyStatus: item.status.privacyStatus,
            });
          }
        }
      }

      pageToken = response.data.nextPageToken || undefined;
      if (!pageToken) {
        break;
      }
    } catch (error: any) {
      console.error("[UPDATE-METADATA] Error fetching videos:", error);
      break;
    }
  }

  return videos;
}

/**
 * Find video by matching filename/title
 */
function findVideoByFilename(
  filename: string,
  videos: VideoInfo[]
): VideoInfo | null {
  const normalizedFilename = filename.toLowerCase().trim();
  
  // Try exact match first
  for (const video of videos) {
    const videoTitle = video.title.toLowerCase().trim();
    if (videoTitle === normalizedFilename) {
      return video;
    }
  }

  // Try matching filename without extension
  const filenameNoExt = normalizedFilename.replace(/\.[^/.]+$/, "");
  for (const video of videos) {
    const videoTitle = video.title.toLowerCase().trim();
    const videoTitleNoExt = videoTitle.replace(/\.[^/.]+$/, "");
    if (videoTitleNoExt === filenameNoExt || videoTitle === filenameNoExt) {
      return video;
    }
  }

  // Try partial match (filename is contained in title or vice versa)
  for (const video of videos) {
    const videoTitle = video.title.toLowerCase().trim();
    if (videoTitle.includes(normalizedFilename) || normalizedFilename.includes(videoTitle)) {
      return video;
    }
  }

  return null;
}

/**
 * Update video metadata
 */
async function updateVideoMetadata(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  row: CSVRow,
  sendProgress: (data: any) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: {
      snippet?: { title?: string; description?: string };
      status?: { privacyStatus?: string; publishAt?: string };
    } = {};

    // Update title and description
    if (row.youtube_title || row.youtube_description) {
      updates.snippet = {};
      if (row.youtube_title) {
        updates.snippet.title = row.youtube_title;
      }
      if (row.youtube_description) {
        updates.snippet.description = row.youtube_description;
      }
    }

    // Update privacy status and scheduling
    if (row.privacyStatus || row.scheduleTime) {
      updates.status = {};
      
      const finalPrivacyStatus = row.privacyStatus || "public";
      if (["public", "private", "unlisted"].includes(finalPrivacyStatus)) {
        updates.status.privacyStatus = finalPrivacyStatus;
      }

      if (row.scheduleTime) {
        const publishDate = parseDate(row.scheduleTime);
        if (publishDate) {
          updates.status.publishAt = publishDate.toISOString();
        }
      }
    }

    // Only update if we have something to update
    if (Object.keys(updates).length === 0) {
      return { success: true };
    }

    const updateParts: string[] = [];
    if (updates.snippet) updateParts.push("snippet");
    if (updates.status) updateParts.push("status");

    await youtube.videos.update({
      part: updateParts,
      requestBody: {
        id: videoId,
        ...updates,
      },
    });

    sendProgress({
      type: 'update_success',
      videoId,
      title: row.youtube_title?.substring(0, 50) || 'Updated',
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        'Unknown error';
    
    sendProgress({
      type: 'update_failed',
      videoId,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Upload thumbnail for a video
 */
async function uploadThumbnail(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  thumbnailPath: string,
  sendProgress: (data: any) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!fs.existsSync(thumbnailPath)) {
      return { success: false, error: 'Thumbnail file not found' };
    }

    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailStream = Readable.from(thumbnailBuffer);

    await youtube.thumbnails.set({
      videoId: videoId,
      media: { body: thumbnailStream },
    });

    sendProgress({
      type: 'thumbnail_success',
      videoId,
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.error?.message || 
                        error?.message || 
                        'Unknown error';
    
    sendProgress({
      type: 'thumbnail_failed',
      videoId,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
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
    const csvFile = formData.get("csvFile") as File | null;

    if (!csvFile) {
      return new Response(
        JSON.stringify({ error: "No CSV file uploaded" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const youtube = google.youtube({
      version: "v3",
      auth: oAuthClient,
    });

    // Parse CSV
    const csvData: CSVRow[] = [];
    const bytes = await csvFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const csvStream = Readable.from(buffer);

    await new Promise<void>((resolve, reject) => {
      csvStream
        .pipe(csvParser())
        .on("data", (row: CSVRow) => {
          csvData.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    if (csvData.length === 0) {
      return new Response(
        JSON.stringify({ error: "CSV file is empty" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user ID for thumbnail lookup
    const userId = session.userId || sessionId;
    const safeUserId = userId?.replace(/[^a-zA-Z0-9._-]/g, "_") || sessionId;
    const assetsDir = path.join(UPLOADS_DIR, safeUserId, "assets", "thumbnails");

    // Return streaming response with progress updates
    const stream = createProgressStream(async (send) => {
      send({
        type: 'start',
        total: csvData.length,
        message: 'Fetching private videos...',
      });

      // Get all private videos
      const privateVideos = await getPrivateVideos(youtube);
      
      send({
        type: 'videos_fetched',
        totalVideos: privateVideos.length,
        totalRows: csvData.length,
      });

      let totalUpdated = 0;
      let totalFailed = 0;
      let totalThumbnails = 0;
      const failedVideos: Array<{ videoName: string; error: string; index: number }> = [];
      const BATCH_SIZE = 50; // Process 50 videos at a time (metadata updates are fast)
      const BATCH_DELAY = 50; // 50ms delay between batches (minimal delay for rate limit safety)

      // Create batches
      const batches: Array<{ index: number; row: CSVRow }>[] = [];
      for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        batches.push(
          csvData.slice(i, i + BATCH_SIZE).map((row, batchIndex) => ({
            index: i + batchIndex,
            row,
          }))
        );
      }

      const totalBatches = batches.length;
      const startTime = Date.now();

      send({
        type: 'batches_created',
        totalBatches,
        batchSize: BATCH_SIZE,
        total: csvData.length,
      });

      // Process batches
      for (let batchNum = 0; batchNum < batches.length; batchNum++) {
        const batch = batches[batchNum];
        
        send({
          type: 'batch_start',
          batchNumber: batchNum + 1,
          totalBatches,
          batchSize: batch.length,
        });

        // Process batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async ({ index, row }) => {
            if (!row.video_name) {
              return {
                index,
                videoName: '',
                success: false,
                error: 'Missing video_name',
                thumbnailSuccess: false,
              };
            }

            send({
              type: 'row_start',
              index,
              videoName: row.video_name,
            });

            // Find matching video
            const video = findVideoByFilename(row.video_name, privateVideos);
            
            if (!video) {
              return {
                index,
                videoName: row.video_name,
                success: false,
                error: 'Video not found',
                thumbnailSuccess: false,
              };
            }

            // Update metadata
            const updateResult = await updateVideoMetadata(
              youtube,
              video.id,
              row,
              send
            );

            if (!updateResult.success) {
              return {
                index,
                videoName: row.video_name,
                success: false,
                error: updateResult.error || 'Update failed',
                thumbnailSuccess: false,
              };
            }

            // Upload thumbnail if provided
            let thumbnailSuccess = false;
            if (row.thumbnail_name) {
              const thumbnailPath = path.join(assetsDir, row.thumbnail_name);
              const thumbResult = await uploadThumbnail(
                youtube,
                video.id,
                thumbnailPath,
                send
              );
              thumbnailSuccess = thumbResult.success;
            }

            return {
              index,
              videoName: row.video_name,
              success: true,
              thumbnailSuccess,
            };
          })
        );

        // Process batch results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            const res = result.value;
            if (res.success) {
              totalUpdated++;
              if (res.thumbnailSuccess) {
                totalThumbnails++;
              }
            } else {
              totalFailed++;
              if (res.videoName) {
                failedVideos.push({
                  videoName: res.videoName,
                  error: res.error || 'Unknown error',
                  index: res.index,
                });
              }
            }
          } else {
            totalFailed++;
            failedVideos.push({
              videoName: 'Unknown',
              error: result.reason?.message || 'Unknown error',
              index: -1,
            });
          }
        }

        // Calculate progress metrics
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const processed = totalUpdated + totalFailed;
        const rate = processed > 0 ? processed / elapsed : 0; // videos per second
        const remaining = csvData.length - processed;
        const estimatedSeconds = rate > 0 ? remaining / rate : 0;

        send({
          type: 'batch_complete',
          batchNumber: batchNum + 1,
          totalBatches,
          totalUpdated,
          totalFailed,
          totalThumbnails,
          processed,
          total: csvData.length,
          rate: Math.round(rate * 60), // videos per minute
          estimatedSeconds: Math.round(estimatedSeconds),
        });

        // Small delay between batches to respect rate limits
        if (batchNum < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      const totalTime = (Date.now() - startTime) / 1000;
      const avgRate = csvData.length > 0 ? csvData.length / totalTime : 0;

      send({
        type: 'complete',
        totalUpdated,
        totalFailed,
        totalThumbnails,
        total: csvData.length,
        totalTime: Math.round(totalTime),
        avgRate: Math.round(avgRate * 60), // videos per minute
        failedVideos: failedVideos.slice(0, 100), // Limit to first 100 failures for UI
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
    console.error("=== METADATA UPDATE ERROR ===");
    console.error("Error:", error);
    console.error("Message:", error?.message);
    console.error("Stack:", error?.stack);
    console.error("============================");
    
    return new Response(
      JSON.stringify({ 
        error: error?.message || "Error during metadata update" 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

