import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueueItem } from "@/lib/queue";

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

    const item = getQueueItem(jobId);
    
    if (!item) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (item.sessionId !== sessionId) {
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


