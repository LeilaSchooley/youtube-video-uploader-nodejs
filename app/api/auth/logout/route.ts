import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { deleteSession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  
  if (sessionId) {
    deleteSession(sessionId);
    cookieStore.delete("sessionId");
  }

  // Get the correct base URL (handles proxy/forwarded headers)
  // x-forwarded-host can contain multiple comma-separated values, take the first one
  const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "zondiscounts.com";
  const host = rawHost.split(",")[0].trim();
  const rawProtocol = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
  const protocol = rawProtocol.split(",")[0].trim();
  const baseUrl = `${protocol}://${host}`;

  return NextResponse.redirect(new URL("/", baseUrl));
}

