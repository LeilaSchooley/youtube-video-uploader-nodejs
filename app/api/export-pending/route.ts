import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getBulkQueueItem } from "@/lib/bulk-queue";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/export-pending?jobId=xxx
 * Returns a CSV of pending videos for the job (no Dropbox). User can download via Generate button.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    if (!jobId) {
      return jsonApiError("jobId is required", 400, "BAD_REQUEST");
    }

    const job = getBulkQueueItem(jobId);
    if (!job) {
      return jsonApiError("Job not found", 404, "NOT_FOUND");
    }

    if (job.sessionId !== sessionId && job.userId !== session.userId) {
      return jsonApiError("Unauthorized", 403, "FORBIDDEN");
    }

    const progress = job.progress || [];
    const items = job.items || [];
    const totalVideos = items.length;

    // Pending = not completed (no videoId) and not failed
    const pendingIndices: number[] = [];
    for (let i = 0; i < totalVideos; i++) {
      const prog = progress.find((p) => p && p.index === i);
      const isDone =
        prog &&
        (prog.videoId ||
          (prog.status &&
            (prog.status.includes("Uploaded") ||
              prog.status.includes("Completed") ||
              prog.status.includes("Scheduled") ||
              prog.status.includes("scheduled") ||
              prog.status.includes("Already uploaded"))));
      const isFailed =
        prog &&
        prog.status &&
        (prog.status.includes("Failed") ||
          prog.status.includes("Missing") ||
          prog.status.includes("Invalid") ||
          prog.status.includes("not found") ||
          prog.status.includes("error"));
      if (!isDone && !isFailed) {
        pendingIndices.push(i);
      }
    }

    if (pendingIndices.length === 0) {
      return NextResponse.json(
        { error: "No pending videos for this job" },
        { status: 400 },
      );
    }

    // Build CSV: collect all keys from pending items (prefer common sheet columns first)
    const preferredKeys = [
      "video_name",
      "title",
      "youtube_title",
      "description",
      "privacyStatus",
      "publishDate",
      "url",
      "dropboxFileId",
      "driveFileId",
    ];
    const keySet = new Set<string>(preferredKeys);
    for (const idx of pendingIndices) {
      const item = items[idx];
      if (item && typeof item === "object") {
        Object.keys(item).forEach((k) => keySet.add(k));
      }
    }
    const restKeys = Array.from(keySet).filter(
      (k) => k !== "index" && !preferredKeys.includes(k),
    );
    const headers = [
      "index",
      ...preferredKeys.filter((k) => keySet.has(k)),
      ...restKeys,
    ];

    const escapeCsvValue = (val: unknown): string => {
      const s = val == null ? "" : String(val);
      if (
        s.includes(",") ||
        s.includes('"') ||
        s.includes("\n") ||
        s.includes("\r")
      ) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows: string[] = [];
    rows.push(headers.join(","));
    for (const idx of pendingIndices) {
      const item = items[idx];
      const record: Record<string, unknown> =
        item && typeof item === "object" ? { ...item } : {};
      record.index = idx + 1;
      const row = headers.map((h) => escapeCsvValue(record[h]));
      rows.push(row.join(","));
    }

    const csv = rows.join("\n");
    const filename = `pending-videos-${jobId}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[EXPORT-PENDING] Error:", message);
    return NextResponse.json(
      { error: message || "Error exporting pending videos" },
      { status: 500 },
    );
  }
}
