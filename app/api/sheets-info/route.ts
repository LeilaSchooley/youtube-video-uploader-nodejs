import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOAuthClient } from "@/lib/auth";
import { cookies } from "next/headers";
import { extractSpreadsheetId, getSpreadsheetMetadata } from "@/lib/sheets";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/sheets-info
 * Get spreadsheet metadata including available sheets
 * 
 * Query params:
 * - spreadsheetUrl: string - Google Sheets URL or ID
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
    const spreadsheetUrl = searchParams.get("spreadsheetUrl");
    
    if (!spreadsheetUrl) {
      return NextResponse.json(
        { error: "spreadsheetUrl is required" },
        { status: 400 }
      );
    }

    // Extract spreadsheet ID
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: "Invalid Google Sheets URL or ID" },
        { status: 400 }
      );
    }

    const oAuthClient = getOAuthClient();
    oAuthClient.setCredentials(session.tokens);

    // Get spreadsheet metadata
    try {
      const metadata = await getSpreadsheetMetadata(spreadsheetId, oAuthClient);
      return NextResponse.json({
        success: true,
        spreadsheetId,
        title: metadata.title,
        sheets: metadata.sheets,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: `Failed to access Google Sheet: ${error?.message || "Unknown error"}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[SHEETS-INFO] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error fetching sheet info" },
      { status: 500 }
    );
  }
}
