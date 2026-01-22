import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { listDriveItems } from "@/lib/drive";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/browse-drive
 * Browse Google Drive folders and files
 * 
 * Query params:
 * - folderId: string | null - Folder ID to browse (null or 'root' for My Drive)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated || !session.tokens) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    
    // Convert 'root' string to null for root folder
    const targetFolderId = folderId === 'root' || folderId === null ? null : folderId;

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const result = await listDriveItems(targetFolderId, oAuthClient);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("[BROWSE-DRIVE] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error browsing Drive" },
      { status: 500 }
    );
  }
}
