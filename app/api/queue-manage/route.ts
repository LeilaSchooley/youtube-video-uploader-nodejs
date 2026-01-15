import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { pauseJob, resumeJob, cancelJob, getQueueItem } from "@/lib/queue";
import { cleanupUploadDir } from "@/lib/storage";

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

    if (!jobId || !action) {
      return NextResponse.json(
        { error: "jobId and action are required" },
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
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'pause', 'resume', or 'cancel'" },
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

