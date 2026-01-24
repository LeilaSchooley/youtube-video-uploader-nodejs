import { NextResponse } from "next/server";
import { generateDropboxAuthUrl } from "@/lib/auth";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const url = generateDropboxAuthUrl();
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Error generating Dropbox auth URL:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate Dropbox auth URL" },
      { status: 500 }
    );
  }
}
