import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { downloadDropboxFile } from "@/lib/dropbox";
import { cookies } from "next/headers";
import { jsonApiError } from "@/lib/api-response";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require("xlsx") as typeof import("xlsx");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/dropbox-sheet-names?filePath=/path/to/file.xlsx
 * Returns list of sheet names for a Dropbox XLSX/XLS file (for CSV returns a single "Sheet1").
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const session = getSession(sessionId);
    if (!session?.authenticated || !session.tokens) {
      return jsonApiError("Not authenticated", 401, "UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("filePath");
    if (!filePath || !filePath.startsWith("/")) {
      return jsonApiError(
        "filePath query parameter (Dropbox path) is required",
        400,
        "BAD_REQUEST",
      );
    }

    const dropboxToken = await getDropboxToken(
      session.dropboxToken,
      session.dropboxRefreshToken,
      sessionId,
    );
    if (!dropboxToken) {
      return NextResponse.json(
        { error: "Dropbox not connected" },
        { status: 401 },
      );
    }

    const fileStream = await downloadDropboxFile(
      filePath,
      dropboxToken,
      sessionId,
      session.dropboxRefreshToken,
    );

    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);

    const ext = filePath.toLowerCase().split(".").pop() || "";
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheets = (workbook.SheetNames || []).map((title: string) => ({
        title,
        sheetId: 0,
      }));
      return NextResponse.json({
        success: true,
        title: filePath.split("/").pop() || "Workbook",
        sheets,
      });
    }

    // CSV has no multiple sheets; return single virtual sheet
    return NextResponse.json({
      success: true,
      title: filePath.split("/").pop() || "File",
      sheets: [{ title: "Sheet1", sheetId: 0 }],
    });
  } catch (error: any) {
    console.error("[DROPBOX-SHEET-NAMES] Error:", error);
    return NextResponse.json(
      {
        error:
          error?.message || "Failed to read sheet names from Dropbox file",
      },
      { status: 500 },
    );
  }
}
