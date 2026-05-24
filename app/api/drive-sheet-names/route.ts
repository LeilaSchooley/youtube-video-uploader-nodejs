import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireDriveOAuthClient } from "@/lib/drive-api-auth";
import {
  downloadDriveFileToBuffer,
  getDriveFileMetadata,
} from "@/lib/drive";
import { jsonApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/drive-sheet-names?fileId=DRIVE_FILE_ID
 * Sheet names for a Drive-hosted XLSX/CSV metadata file.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const fileId = new URL(request.url).searchParams.get("fileId")?.trim();
    if (!fileId) {
      return jsonApiError("fileId query parameter is required", 400, "BAD_REQUEST");
    }

    const driveAuth = await requireDriveOAuthClient(sessionId);
    if ("response" in driveAuth) {
      return driveAuth.response;
    }

    const meta = await getDriveFileMetadata(fileId, driveAuth.client);
    const ext = meta.name.toLowerCase().split(".").pop() || "";

    if (ext === "csv") {
      return NextResponse.json({
        success: true,
        title: meta.name,
        sheets: [{ title: "Sheet1", sheetId: 0 }],
      });
    }

    if (ext !== "xlsx" && ext !== "xls") {
      return jsonApiError(
        "File must be .csv, .xlsx, or .xls",
        400,
        "BAD_REQUEST",
      );
    }

    const buffer = await downloadDriveFileToBuffer(fileId, driveAuth.client);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets = (workbook.SheetNames || []).map((title: string) => ({
      title,
      sheetId: 0,
    }));

    return NextResponse.json({
      success: true,
      title: meta.name,
      sheets,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[DRIVE-SHEET-NAMES]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
