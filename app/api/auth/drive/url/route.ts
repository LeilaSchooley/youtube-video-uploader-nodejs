import { NextResponse } from "next/server";
import { generateDriveAuthUrl, isGoogleDriveOAuthConfigured } from "@/lib/auth-drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    if (!isGoogleDriveOAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Google Drive OAuth not configured. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REDIRECT_URI.",
        },
        { status: 503 },
      );
    }
    const url = generateDriveAuthUrl();
    return NextResponse.json({ url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to generate Drive auth URL";
    console.error("[DRIVE AUTH URL]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
