import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { requireDriveOAuthClient } from "@/lib/drive-api-auth";
import { getDriveFileMetadata, isDriveFileId, parseDriveIdFromInput } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/drive-file-meta?fileId=... or ?url=...
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session?.authenticated) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const raw =
      searchParams.get("fileId")?.trim() ||
      searchParams.get("url")?.trim() ||
      "";
    const fileId = parseDriveIdFromInput(raw);
    if (!fileId || !isDriveFileId(fileId)) {
      return NextResponse.json(
        { error: "Invalid Drive file link or ID" },
        { status: 400 },
      );
    }

    const driveAuth = await requireDriveOAuthClient(sessionId);
    if ("response" in driveAuth) {
      return driveAuth.response;
    }

    const meta = await getDriveFileMetadata(fileId, driveAuth.client);
    return NextResponse.json({ success: true, file: meta });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DRIVE-FILE-META]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
