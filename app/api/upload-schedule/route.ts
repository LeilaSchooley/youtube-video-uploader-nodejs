import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import {
  readWorkerUploadSchedule,
  writeWorkerUploadSchedule,
} from "@/lib/server-upload-schedule";
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

  const state = readWorkerUploadSchedule();
  return NextResponse.json({ success: true, ...state });
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
      enabled?: boolean;
      videosPerDay?: string;
    };

    const enabled = body.enabled === true;
    const videosPerDay =
      typeof body.videosPerDay === "string" ? body.videosPerDay : "";

    if (enabled) {
      const n = parseInt(videosPerDay.trim(), 10);
      if (Number.isNaN(n) || n <= 0) {
        return jsonApiError(
          "videosPerDay must be a positive number when the daily limit is enabled",
          400,
          "BAD_REQUEST",
        );
      }
    }

    const saved = writeWorkerUploadSchedule(enabled, videosPerDay);
    return NextResponse.json({ success: true, ...saved });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save schedule";
    console.error("[UPLOAD-SCHEDULE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
