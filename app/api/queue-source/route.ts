import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import {
  getQueueSourceForSession,
  setQueueSourceForSession,
  normalizeDropboxPath,
  type QueueSourceType,
} from "@/lib/queue-source";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  if (!sessionId) {
    return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
  }

  const session = getSession(sessionId);
  if (!session || !session.authenticated) {
    return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
  }

  const rec = getQueueSourceForSession(sessionId);
  return NextResponse.json({
    success: true,
    sourceType: (rec?.sourceType ?? "none") as QueueSourceType,
    rootPath: rec?.rootPath ?? null,
    updatedAt: rec?.updatedAt ?? null,
  });
}

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

    const body = (await request.json()) as {
      sourceType?: QueueSourceType;
      rootPath?: string | null;
    };

    const sourceType = body.sourceType ?? "none";
    if (sourceType !== "none" && sourceType !== "dropbox_python_queue") {
      return jsonApiError("Invalid sourceType", 400, "BAD_REQUEST");
    }

    if (sourceType === "dropbox_python_queue") {
      const root = body.rootPath?.trim();
      if (!root) {
        return jsonApiError("rootPath required for dropbox_python_queue", 400, "BAD_REQUEST");
      }
      setQueueSourceForSession(sessionId, {
        sourceType: "dropbox_python_queue",
        rootPath: normalizeDropboxPath(root),
        updatedAt: new Date().toISOString(),
      });
    } else {
      setQueueSourceForSession(sessionId, {
        sourceType: "none",
        rootPath: "",
        updatedAt: new Date().toISOString(),
      });
    }

    const rec = getQueueSourceForSession(sessionId);
    return NextResponse.json({
      success: true,
      sourceType: (rec?.sourceType ?? "none") as QueueSourceType,
      rootPath: rec?.rootPath ?? null,
      updatedAt: rec?.updatedAt ?? null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save queue source";
    console.error("[QUEUE-SOURCE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
