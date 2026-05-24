import { NextRequest, NextResponse } from "next/server";
import {
  manifestRowsToCsv,
  filterFailedRows,
} from "@/lib/manifest-queue-list";
import { requireManifestQueueAuth } from "@/lib/manifest-queue-api-auth";
import { listManifestRowsForAuth } from "@/lib/manifest-queue-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireManifestQueueAuth();
    if (!auth.ok) return auth.response;

    const status = request.nextUrl.searchParams.get("status")?.trim();
    const rows = await listManifestRowsForAuth(auth);
    const filtered =
      status === "failed" || status === "failed_only"
        ? filterFailedRows(rows)
        : rows;
    const csv = manifestRowsToCsv(filtered);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="manifest-queue-${day}.csv"`,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Manifest queue export failed";
    console.error("[MANIFEST-QUEUE-EXPORT]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
