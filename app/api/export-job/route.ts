import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { getBulkQueue } from "@/lib/bulk-queue";
import { parseQueryOr400, exportJobQuerySchema } from "@/lib/api-validation";
import { jobBelongsToViewer } from "@/lib/job-ownership";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = parseQueryOr400(searchParams, exportJobQuerySchema);
    if (parsed instanceof Response) return parsed;
    const { jobId, format } = parsed;

    const bulkQueue = getBulkQueue();
    const job = bulkQueue.find(
      (j) => j.id === jobId && jobBelongsToViewer(j, session.userId, sessionId),
    );

    if (!job) {
      return NextResponse.json(
        { error: "Job not found or unauthorized" },
        { status: 404 },
      );
    }

    const items = job.items || [];
    const progress = job.progress || [];
    const progressByIndex = new Map(
      progress.map((p) => [p.index, p] as [number, typeof p]),
    );

    const report = items.map((item, idx) => {
      const p = progressByIndex.get(idx);
      const title = (item as { title?: string }).title || `Video ${idx + 1}`;
      const status = p?.status || "pending";
      const isSuccess =
        !!p?.videoId ||
        status.includes("Uploaded") ||
        status.includes("Scheduled") ||
        status.includes("scheduled");
      const isFailed = status.includes("Failed") || !!p?.error;

      return {
        index: idx + 1,
        title,
        status: isSuccess ? "success" : isFailed ? "failed" : "pending",
        videoId: p?.videoId,
        error: p?.error,
      };
    });

    const summary = {
      jobId: job.id,
      totalVideos: items.length,
      completed: report.filter((r) => r.status === "success").length,
      failed: report.filter((r) => r.status === "failed").length,
      pending: report.filter((r) => r.status === "pending").length,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };

    if (format === "csv") {
      const csvRows = [
        ["Index", "Title", "Status", "Video ID", "Error"],
        ...report.map((r) => [
          r.index,
          `"${(r.title || "").replace(/"/g, '""')}"`,
          r.status,
          r.videoId || "",
          `"${(r.error || "").replace(/"/g, '""')}"`,
        ]),
      ];
      const csv = csvRows.map((row) => row.join(",")).join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="job-${jobId}-report.csv"`,
        },
      });
    }

    return NextResponse.json(
      { summary, report },
      {
        headers: {
          "Content-Disposition": `attachment; filename="job-${jobId}-report.json"`,
        },
      },
    );
  } catch (error: unknown) {
    console.error("[EXPORT-JOB] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to export job report",
      },
      { status: 500 },
    );
  }
}
