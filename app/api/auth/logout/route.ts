import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { deleteSession, getSession } from "@/lib/session";
import { getBulkQueue } from "@/lib/bulk-queue";
import { getQueue } from "@/lib/queue";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  
  if (sessionId) {
    // Check if there are active jobs for this session
    const session = getSession(sessionId);
    const userId = session?.userId;
    
    // Check for active jobs in both queues
    const bulkQueue = getBulkQueue();
    const regularQueue = getQueue();
    
    const hasActiveBulkJobs = bulkQueue.some(
      (job) => 
        (job.sessionId === sessionId || job.userId === userId) &&
        (job.status === "pending" || job.status === "processing")
    );
    
    const hasActiveRegularJobs = regularQueue.some(
      (job) => 
        (job.sessionId === sessionId || job.userId === userId) &&
        (job.status === "pending" || job.status === "processing")
    );
    
    if (hasActiveBulkJobs || hasActiveRegularJobs) {
      // Don't delete session if there are active jobs - just clear the cookie
      // This allows the worker to continue processing using the stored tokens
      cookieStore.delete("sessionId");
      console.log(`[LOGOUT] Keeping session ${sessionId.substring(0, 10)}... for active jobs`);
    } else {
      // No active jobs - safe to delete session
      deleteSession(sessionId);
      cookieStore.delete("sessionId");
    }
  }

  // Get the correct base URL (handles proxy/forwarded headers)
  // x-forwarded-host can contain multiple comma-separated values, take the first one
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "zondiscounts.com";
  const host = rawHost.split(",")[0].trim();
  const rawProtocol = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
  const protocol = rawProtocol.split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  return NextResponse.redirect(new URL("/", baseUrl));
}

