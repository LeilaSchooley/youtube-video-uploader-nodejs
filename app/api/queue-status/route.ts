import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem } from "@/lib/queue";
import { getBulkQueueItem } from "@/lib/bulk-queue";

export const dynamic = "force-dynamic";

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

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Check both regular queue and bulk queue
    let item = getQueueItem(jobId);
    
    // If not found in regular queue, check bulk queue
    if (!item) {
      const bulkItem = getBulkQueueItem(jobId);
      if (bulkItem) {
        // Normalize bulk item to match expected format
        item = {
          id: bulkItem.id,
          sessionId: bulkItem.sessionId,
          userId: bulkItem.userId,
          status: bulkItem.status,
          progress: bulkItem.progress,
          totalVideos: bulkItem.items.length,
          items: bulkItem.items.map((i, idx) => ({ 
            title: i.title && i.title.trim() ? i.title.trim() : `Video ${idx + 1}` 
          })),
          createdAt: bulkItem.createdAt,
          updatedAt: bulkItem.updatedAt,
          error: bulkItem.error,
          videosPerDay: bulkItem.videosPerDay,
          startDate: bulkItem.startDate,
        } as any;
      }
    }
    
    if (!item) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check authorization - allow if sessionId or userId matches
    if (item.sessionId !== sessionId && item.userId !== session.userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      job: item,
    });
  } catch (error: any) {
    console.error("Get queue status error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get queue status" },
      { status: 500 }
    );
  }
}









