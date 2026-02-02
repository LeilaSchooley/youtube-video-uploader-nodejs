import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDropboxToken } from "@/lib/auth";
import { listDropboxItems } from "@/lib/dropbox";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/browse-dropbox
 * Browse Dropbox folders and files
 *
 * Query params:
 * - folderPath: string - Folder path to browse (default: "/" for root)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get("folderPath") || "/";

    // Normalize path - ensure it starts with /
    const normalizedPath = folderPath.startsWith("/")
      ? folderPath
      : `/${folderPath}`;

    // Debug: Log token info (without exposing full token)
    console.log(
      `[BROWSE-DROPBOX] Token length: ${dropboxToken.length}, starts with: ${dropboxToken.substring(0, 10)}...`,
    );
    console.log(
      `[BROWSE-DROPBOX] Requested path: "${folderPath}", normalized: "${normalizedPath}"`,
    );

    const items = await listDropboxItems(
      normalizedPath,
      dropboxToken,
      sessionId,
      session.dropboxRefreshToken,
    );

    // Separate folders and files
    const folders = items
      .filter((item) => item.type === "folder")
      .map((item) => ({
        id: item.id,
        name: item.name,
        modifiedTime: item.modifiedTime,
      }));

    const files = items
      .filter((item) => item.type === "file")
      .map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        modifiedTime: item.modifiedTime,
      }));

    // Get current folder info
    const currentFolder =
      normalizedPath === "/"
        ? { id: "/", name: "Dropbox" }
        : {
            id: normalizedPath,
            name: normalizedPath.split("/").pop() || "Dropbox",
          };

    return NextResponse.json({
      success: true,
      folders,
      files,
      currentFolder,
    });
  } catch (error: any) {
    console.error("[BROWSE-DROPBOX] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error browsing Dropbox" },
      { status: 500 },
    );
  }
}
