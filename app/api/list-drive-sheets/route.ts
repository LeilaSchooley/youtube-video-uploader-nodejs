import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { cookies } from "next/headers";
import { listDriveSheets } from "@/lib/drive";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    const folderId = searchParams.get("folderId") || null;

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    const sheets = await listDriveSheets(folderId, oAuthClient);

    return NextResponse.json({ sheets });
  } catch (error: any) {
    console.error("[LIST-DRIVE-SHEETS] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list Drive sheets" },
      { status: 500 }
    );
  }
}
