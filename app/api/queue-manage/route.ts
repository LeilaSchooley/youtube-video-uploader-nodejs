import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { pauseJob, resumeJob, cancelJob, deleteJob, deleteAllCompletedJobs, getQueueItem, getQueue } from "@/lib/queue";
import { deleteUploadDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { jobId, action } = body;

    // Handle "delete-all" action (doesn't require jobId)
    if (action === "delete-all") {
      const userId = session?.userId;
      
      // Get jobs to delete before deletion (for cleanup)
      const allJobs = getQueue();
      const jobsToDelete = allJobs.filter(job => {
        const canDelete = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
        const belongsToUser = (userId && job.userId === userId) || 
                             (!job.userId && sessionId && job.sessionId === sessionId);
        return canDelete && belongsToUser;
      });
      
      // Clean up files for jobs that will be deleted
      for (const job of jobsToDelete) {
        try {
          deleteUploadDir(job.sessionId, job.id);
        } catch (cleanupError) {
          console.error(`Error cleaning up files for job ${job.id}:`, cleanupError);
          // Continue with deletion even if cleanup fails
        }
      }
      
      // Now delete the jobs
      const result = deleteAllCompletedJobs(userId, sessionId);
      
      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${result.deleted} completed/failed/cancelled job(s)`,
        deleted: result.deleted
      });
    }

    if (!jobId || !action) {
      return NextResponse.json(
        { error: "jobId and action are required (except for 'delete-all' action)" },
        { status: 400 }
      );
    }

    const job = getQueueItem(jobId);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check authorization - match by userId (preferred) or sessionId (backward compatibility)
    const userId = session?.userId;
    const isAuthorized = (userId && job.userId === userId) || 
                        (!job.userId && job.sessionId === sessionId);
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 403 }
      );
    }

    switch (action) {
      case "pause":
        pauseJob(jobId);
        return NextResponse.json({ success: true, message: "Job paused" });
      case "resume":
        resumeJob(jobId);
        return NextResponse.json({ success: true, message: "Job resumed" });
      case "cancel":
        // Clean up uploaded files before cancelling
        try {
          deleteUploadDir(job.sessionId, jobId);
        } catch (cleanupError) {
          console.error("Error cleaning up files:", cleanupError);
          // Continue with cancellation even if cleanup fails
        }
        cancelJob(jobId);
        return NextResponse.json({ success: true, message: "Job cancelled and removed" });
      case "delete":
        // Clean up uploaded files before deleting
        try {
          deleteUploadDir(job.sessionId, jobId);
        } catch (cleanupError) {
          console.error("Error cleaning up files:", cleanupError);
          // Continue with deletion even if cleanup fails
        }
        deleteJob(jobId);
        return NextResponse.json({ success: true, message: "Job deleted" });
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'pause', 'resume', 'cancel', or 'delete'" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Queue management error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to manage queue" },
      { status: 500 }
    );
  }
}

