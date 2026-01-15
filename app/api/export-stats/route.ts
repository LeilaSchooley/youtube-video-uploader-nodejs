import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getQueue } from "@/lib/queue";

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
    const format = searchParams.get("format") || "json"; // json or csv

    const userId = session.userId;
    const queue = getQueue();
    const userQueue = queue.filter(item => {
      const matchesUser = (item.userId && item.userId === userId) || 
                         (!item.userId && item.sessionId === sessionId);
      return matchesUser;
    });

    // Calculate statistics
    const stats = {
      totalJobs: userQueue.length,
      completed: userQueue.filter(j => j.status === "completed").length,
      processing: userQueue.filter(j => j.status === "processing").length,
      pending: userQueue.filter(j => j.status === "pending").length,
      failed: userQueue.filter(j => j.status === "failed").length,
      paused: userQueue.filter(j => j.status === "paused").length,
      cancelled: userQueue.filter(j => j.status === "cancelled").length,
      totalVideos: userQueue.reduce((sum, j) => sum + (j.totalVideos || 0), 0),
      uploadedVideos: userQueue.reduce((sum, j) => {
        return sum + (j.progress?.filter((p: any) => 
          p.status.includes("Uploaded") || p.status.includes("Scheduled")
        ).length || 0);
      }, 0),
      failedVideos: userQueue.reduce((sum, j) => {
        return sum + (j.progress?.filter((p: any) => 
          p.status.includes("Failed") || p.status.includes("Missing")
        ).length || 0);
      }, 0),
      jobs: userQueue.map(job => ({
        id: job.id,
        status: job.status,
        totalVideos: job.totalVideos || 0,
        videosPerDay: job.videosPerDay,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completed: job.progress?.filter((p: any) => 
          p.status.includes("Uploaded") || p.status.includes("Scheduled")
        ).length || 0,
        failed: job.progress?.filter((p: any) => 
          p.status.includes("Failed") || p.status.includes("Missing")
        ).length || 0,
      })),
    };

    if (format === "csv") {
      // Generate CSV
      const csvRows = [
        ["Statistic", "Value"],
        ["Total Jobs", stats.totalJobs],
        ["Completed", stats.completed],
        ["Processing", stats.processing],
        ["Pending", stats.pending],
        ["Failed", stats.failed],
        ["Paused", stats.paused],
        ["Cancelled", stats.cancelled],
        ["Total Videos", stats.totalVideos],
        ["Uploaded Videos", stats.uploadedVideos],
        ["Failed Videos", stats.failedVideos],
        [],
        ["Job ID", "Status", "Total Videos", "Completed", "Failed", "Videos Per Day", "Created At"],
        ...stats.jobs.map(j => [
          j.id,
          j.status,
          j.totalVideos,
          j.completed,
          j.failed,
          j.videosPerDay,
          j.createdAt,
        ]),
      ];

      const csv = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ).join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="youtube-uploader-stats-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    return NextResponse.json(stats, {
      headers: {
        "Content-Disposition": `attachment; filename="youtube-uploader-stats-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error: any) {
    console.error("Export stats error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to export statistics" },
      { status: 500 }
    );
  }
}




