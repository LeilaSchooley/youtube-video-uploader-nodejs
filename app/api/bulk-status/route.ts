import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getBulkQueueItem, getBulkQueue } from "@/lib/bulk-queue";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/bulk-status?jobId=xxx - Get status of a specific bulk upload job
 * GET /api/bulk-status - Get all bulk upload jobs for the current session
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (jobId) {
      // Get specific job
      const job = getBulkQueueItem(jobId);
      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify job belongs to session
      if (job.sessionId !== sessionId && job.userId !== session.userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }

      return NextResponse.json({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        totalItems: job.items.length,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        error: job.error,
      });
    } else {
      // Get all jobs for this session
      const allJobs = getBulkQueue();
      const userJobs = allJobs.filter(
        job => job.sessionId === sessionId || job.userId === session.userId
      );

      return NextResponse.json({
        jobs: userJobs.map(job => ({
          jobId: job.id,
          status: job.status,
          totalItems: job.items.length,
          completedItems: job.progress.filter(p => p.videoId).length,
          failedItems: job.progress.filter(p => p.error).length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
      });
    }
  } catch (error: any) {
    console.error("[BULK-STATUS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error fetching job status" },
      { status: 500 }
    );
  }
}

