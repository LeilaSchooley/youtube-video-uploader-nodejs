import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import {
  getDriveOAuthClientForSession,
  isGoogleDriveOAuthConfigured,
  driveTokenHasMetadataScope,
} from "@/lib/auth-drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/drive-picker-config
 * Returns credentials for the Google Picker (client-side) + whether browse scope is granted.
 */
export async function GET() {
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

    const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim() || "";
    const appId = process.env.GOOGLE_DRIVE_APP_ID?.trim() || "";
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || "";

    const pickerConfigured = !!(
      apiKey &&
      appId &&
      isGoogleDriveOAuthConfigured()
    );

    const driveTokens = session.driveTokens;
    const hasMetadataScope = driveTokenHasMetadataScope(driveTokens?.scope);

    let accessToken: string | null = null;
    if (isGoogleDriveOAuthConfigured()) {
      const client = await getDriveOAuthClientForSession(sessionId);
      const token = client?.credentials?.access_token;
      accessToken = typeof token === "string" ? token : null;
    }

    return NextResponse.json({
      success: true,
      pickerConfigured,
      hasMetadataScope,
      apiKey: pickerConfigured ? apiKey : undefined,
      appId: pickerConfigured ? appId : undefined,
      clientId: clientId || undefined,
      accessToken: accessToken || undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DRIVE-PICKER-CONFIG]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
