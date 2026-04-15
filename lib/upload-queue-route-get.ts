import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { jobBelongsToViewer } from "@/lib/job-ownership";
import { getQueue } from "@/lib/queue";
import { getBulkQueue } from "@/lib/bulk-queue";
import { readHeartbeat } from "@/lib/worker-health";
import type { QueueItem } from "@/lib/queue";
import type { BulkUploadItem } from "@/lib/bulk-queue";

export async function handleUploadQueueGet(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get both regular queue and bulk queue
    const regularQueue = getQueue();
    const bulkQueue = getBulkQueue();

    // Global worker busy: any job (any user) is in "processing" => worker is running
    const workerBusy = bulkQueue.some((j) => j.status === "processing");
    const workerHeartbeat = readHeartbeat();

    // Filter jobs by session/user
    const userRegularJobs = regularQueue.filter(
      (job: QueueItem) => jobBelongsToViewer(job, session.userId, sessionId),
    );

    const userBulkJobs = bulkQueue.filter(
      (job: BulkUploadItem) => jobBelongsToViewer(job, session.userId, sessionId),
    );

    // Compute position ahead for each bulk job (how many jobs before it in queue)
    const positionAheadByJobId = new Map<string, number>();
    let aheadCount = 0;
    for (const j of bulkQueue) {
      if (j.status === "pending" || j.status === "processing") {
        positionAheadByJobId.set(j.id, aheadCount);
        aheadCount++;
      }
    }

    // Combine and normalize both queues
    const combinedQueue = [
      ...userRegularJobs.map((job: QueueItem) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        totalVideos: job.totalVideos || job.progress?.length || 0,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: undefined, // Regular queue items don't have error field
        videosPerDay: job.videosPerDay,
        startDate: job.startDate,
        notes: job.notes,
        positionAhead: 0, // Regular queue not used by worker
      })),
      ...userBulkJobs.map((job: BulkUploadItem) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        totalVideos: job.items.length,
        items: job.items.map((item, idx) => ({
          title:
            item.title && item.title.trim()
              ? item.title.trim()
              : `Video ${idx + 1}`,
        })), // Include titles for next batch display (with fallback)
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
        videosPerDay: job.videosPerDay,
        startDate: job.startDate,
        positionAhead: positionAheadByJobId.get(job.id) ?? 0,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return new Response(
      JSON.stringify({
        queue: combinedQueue,
        workerBusy,
        workerHeartbeat: workerHeartbeat
          ? {
              lastRunAt: workerHeartbeat.lastRunAt,
              jobId: workerHeartbeat.jobId,
            }
          : null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[UPLOAD-QUEUE] GET Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Error fetching queue" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}