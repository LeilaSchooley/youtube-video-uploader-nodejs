import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { pauseJob, resumeJob, cancelJob, deleteJob, deleteAllCompletedJobs, deleteAllJobs, getQueueItem, getQueue } from "@/lib/queue";
import { deleteAllBulkJobs, deleteBulkJob, getBulkQueue, getBulkQueueItem } from "@/lib/bulk-queue";
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

    // Handle "delete-all" action (doesn't require jobId) - deletes only completed/failed/cancelled
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
          // Use userId if available, fallback to sessionId for backward compatibility
          deleteUploadDir(job.userId, job.id, job.sessionId);
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

    // Handle "delete-all-jobs" action - deletes ALL jobs regardless of status
    if (action === "delete-all-jobs") {
      const userId = session?.userId;
      
      // Get ALL jobs to delete before deletion (for cleanup)
      const allJobs = getQueue();
      const allBulkJobs = getBulkQueue();
      
      const regularJobsToDelete = allJobs.filter(job => {
        const belongsToUser = (userId && job.userId === userId) || 
                             (!job.userId && sessionId && job.sessionId === sessionId);
        return belongsToUser;
      });
      
      const bulkJobsToDelete = allBulkJobs.filter(job => {
        const belongsToUser = (userId && job.userId === userId) || 
                             (!job.userId && sessionId && job.sessionId === sessionId);
        return belongsToUser;
      });
      
      // Clean up files for regular jobs that will be deleted
      for (const job of regularJobsToDelete) {
        try {
          deleteUploadDir(job.userId, job.id, job.sessionId);
        } catch (cleanupError) {
          console.error(`Error cleaning up files for job ${job.id}:`, cleanupError);
          // Continue with deletion even if cleanup fails
        }
      }
      
      // Clean up files for bulk jobs that will be deleted
      for (const job of bulkJobsToDelete) {
        try {
          deleteUploadDir(job.userId, job.id, job.sessionId);
        } catch (cleanupError) {
          console.error(`Error cleaning up files for bulk job ${job.id}:`, cleanupError);
          // Continue with deletion even if cleanup fails
        }
      }
      
      // Delete all jobs from both queues
      const regularResult = deleteAllJobs(userId, sessionId);
      const bulkResult = deleteAllBulkJobs(userId, sessionId);
      
      const totalDeleted = regularResult.deleted + bulkResult.deleted;
      
      return NextResponse.json({ 
        success: true, 
        message: `Deleted ${totalDeleted} job(s) (${regularResult.deleted} regular, ${bulkResult.deleted} bulk)`,
        deleted: totalDeleted,
        regularDeleted: regularResult.deleted,
        bulkDeleted: bulkResult.deleted
      });
    }

    if (!jobId || !action) {
      return NextResponse.json(
        { error: "jobId and action are required (except for 'delete-all' action)" },
        { status: 400 }
      );
    }

    const userId = session?.userId;

    // Bulk jobs (id starts with "bulk-") are in the bulk queue
    const isBulkJob = jobId.startsWith("bulk-");
    const bulkJob = isBulkJob ? getBulkQueueItem(jobId) : undefined;
    const job = isBulkJob ? undefined : getQueueItem(jobId);

    if (isBulkJob) {
      if (!bulkJob) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      const isAuthorized =
        (userId && bulkJob.userId === userId) ||
        (!bulkJob.userId && sessionId && bulkJob.sessionId === sessionId);
      if (!isAuthorized) {
        return NextResponse.json(
          { error: "Job not found or unauthorized" },
          { status: 403 }
        );
      }
      // Only cancel and delete are supported for bulk jobs (no pause/resume in worker)
      if (action === "cancel" || action === "delete") {
        try {
          deleteUploadDir(bulkJob.userId, jobId, bulkJob.sessionId);
        } catch (cleanupError) {
          console.error("Error cleaning up files for bulk job:", cleanupError);
        }
        const removed = deleteBulkJob(jobId);
        if (!removed) {
          return NextResponse.json(
            { error: "Failed to remove job from queue" },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          message: action === "cancel" ? "Job cancelled and removed" : "Job deleted",
        });
      }
      return NextResponse.json(
        { error: "Bulk jobs only support 'cancel' or 'delete'" },
        { status: 400 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const isAuthorized =
      (userId && job.userId === userId) ||
      (!job.userId && sessionId && job.sessionId === sessionId);
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
        try {
          deleteUploadDir(job.userId, jobId, job.sessionId);
        } catch (cleanupError) {
          console.error("Error cleaning up files:", cleanupError);
        }
        cancelJob(jobId);
        return NextResponse.json({ success: true, message: "Job cancelled and removed" });
      case "delete":
        try {
          deleteUploadDir(job.userId, jobId, job.sessionId);
        } catch (cleanupError) {
          console.error("Error cleaning up files:", cleanupError);
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

