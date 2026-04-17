import { NextResponse } from "next/server";
import { listManifestQueueRows } from "@/lib/manifest-queue-list";
import { requireManifestQueueDropboxAuth } from "@/lib/manifest-queue-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireManifestQueueDropboxAuth();
    if (!auth.ok) return auth.response;

    const rows = await listManifestQueueRows(
      auth.queueRoot,
      auth.accessToken,
      auth.sessionId,
      auth.refresh,
    );

    return NextResponse.json({
      success: true,
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
