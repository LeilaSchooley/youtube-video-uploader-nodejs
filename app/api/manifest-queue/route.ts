import { NextResponse } from "next/server";
import {
  listManifestQueueRows,
  listManifestQueueRowsDrive,
} from "@/lib/manifest-queue-list";
import { requireManifestQueueAuth } from "@/lib/manifest-queue-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireManifestQueueAuth();
    if (!auth.ok) return auth.response;

    const rows =
      auth.sourceType === "drive_python_queue"
        ? await listManifestQueueRowsDrive(auth.queueRoot, auth.driveClient)
        : await listManifestQueueRows(
            auth.queueRoot,
            auth.accessToken,
            auth.sessionId,
            auth.refresh,
          );

    return NextResponse.json({
      success: true,
      sourceType: auth.sourceType,
      queueRoot: auth.queueRoot,
      rows,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Manifest queue list failed";
    console.error("[MANIFEST-QUEUE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
