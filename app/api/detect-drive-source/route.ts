import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { getDriveOAuthClientForSession } from "@/lib/auth-drive";
import { detectDrivePythonQueueLayout } from "@/lib/detect-drive-source";
import { normalizeDriveFolderId } from "@/lib/queue-source";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session?.authenticated) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const driveClient = await getDriveOAuthClientForSession(sessionId);
    if (!driveClient) {
      return jsonApiError("Google Drive not connected", 401, "DRIVE_REQUIRED");
    }

    let body: { driveFolderId?: string };
    try {
      body = (await request.json()) as { driveFolderId?: string };
    } catch {
      return jsonApiError("Invalid JSON body", 400, "BAD_REQUEST");
    }

    const rawId = body.driveFolderId?.trim();
    if (!rawId) {
      return jsonApiError("driveFolderId is required", 400, "BAD_REQUEST");
    }

    const folderId = normalizeDriveFolderId(rawId);
    const result = await detectDrivePythonQueueLayout(folderId, driveClient);

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Detection failed";
    console.error("[DETECT-DRIVE-SOURCE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
