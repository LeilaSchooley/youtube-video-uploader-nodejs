import { NextRequest, NextResponse } from "next/server";
import { generateAuthUrl } from "@/lib/auth";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Note: generateAuthUrl already uses prompt=consent to force fresh OAuth consent.
    // This ensures new scopes (like youtube.force-ssl) are shown to users.
    const url = generateAuthUrl();
    return NextResponse.json({
      url,
      hint: "If you're getting permission errors for comments, log out and use this URL to re-authenticate with full permissions.",
    });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate auth URL" },
      { status: 500 }
    );
  }
}









