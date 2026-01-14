import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { pauseJob, resumeJob, cancelJob, getQueueItem } from "@/lib/queue";

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
    if (!job || job.sessionId !== sessionId) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 404 }
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
        cancelJob(jobId);
        return NextResponse.json({ success: true, message: "Job cancelled" });
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

