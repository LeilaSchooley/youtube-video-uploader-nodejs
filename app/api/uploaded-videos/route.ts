import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getUploadedVideos, backfillFromBulkQueue, getUploadedTitlesSet, clearUploadedVideos } from "@/lib/uploaded-videos";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/uploaded-videos
 * Returns the persistent list of all videos ever uploaded (from data/uploaded-videos.json).
 * Query: ?format=csv for CSV download; otherwise JSON.
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
    const format = searchParams.get("format") || "json";
    const shouldBackfill = searchParams.get("backfill") === "1";
    const channelIdFilter = searchParams.get("channelId")?.trim() || undefined;

    if (shouldBackfill) {
      backfillFromBulkQueue();
    }

    const list = getUploadedVideos(
      channelIdFilter ? { channelId: channelIdFilter } : undefined,
    );

    if (format === "csv") {
      const headers = ["videoId", "title", "jobId", "uploadedAt", "channelId"];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const rows = [
        headers.join(","),
        ...list.map((r) =>
          headers
            .map((h) =>
              escape((r as unknown as Record<string, unknown>)[h]),
            )
            .join(","),
        ),
      ];
      const csv = rows.join("\n");
      const filename = `uploaded-videos-${new Date().toISOString().split("T")[0]}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ videos: list, total: list.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOADED-VIDEOS] API error:", message);
    return jsonApiError(message || "Failed to load uploaded videos", 500);
  }
}

/**
 * POST /api/uploaded-videos/check-duplicates
 * Body: { titles: string[] }
 * Returns which of the given titles exist in the uploaded-videos list (case-insensitive match).
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const titles = Array.isArray(body.titles) ? body.titles.map(String) : [];
    const set = getUploadedTitlesSet();
    const duplicateTitles = titles.filter((t: string) =>
      set.has((t || "").toLowerCase().trim()),
    );

    return NextResponse.json({ duplicateTitles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOADED-VIDEOS] check-duplicates error:", message);
    return jsonApiError(message || "Check failed", 500);
  }
}

/**
 * DELETE /api/uploaded-videos
 * Clears the local upload history (data/uploaded-videos.json). Does not delete videos on YouTube.
 * Export first if you want to keep a copy.
 */
export async function DELETE() {
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

    clearUploadedVideos();
    return NextResponse.json({ success: true, message: "Upload history cleared" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UPLOADED-VIDEOS] DELETE error:", message);
    return jsonApiError(message || "Failed to clear", 500);
  }
}
