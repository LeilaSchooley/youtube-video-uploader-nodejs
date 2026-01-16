import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem, updateQueueItem } from "@/lib/queue";

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
    const { jobId, notes } = body;

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
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

    // Check authorization
    const userId = session?.userId;
    const isAuthorized = (userId && job.userId === userId) || 
                        (!job.userId && job.sessionId === sessionId);
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 403 }
      );
    }

    updateQueueItem(jobId, { notes: notes || "" });

    return NextResponse.json({ 
      success: true, 
      message: "Notes updated successfully" 
    });
  } catch (error: any) {
    console.error("Queue notes error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update notes" },
      { status: 500 }
    );
  }
}






