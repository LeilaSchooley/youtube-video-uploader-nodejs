import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession, deleteSession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { status: "error", message: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.tokens) {
      deleteSession(sessionId);
      cookieStore.delete("sessionId");
      return NextResponse.json({
        status: "ok",
        message:
          "No active token found. Your local data will be deleted within 30 days.",
      });
    }

    const oAuthClient = getOAuthClient();
    const token =
      session.tokens.access_token || session.tokens.refresh_token;

    if (token) {
      try {
        await oAuthClient.revokeCredentials();
      } catch (err) {
        console.error("Error revoking credentials:", err);
      }
    }

    // Clear local state
    deleteSession(sessionId);
    cookieStore.delete("sessionId");

    return NextResponse.json({
      status: "ok",
      message:
        "Your access has been revoked and your local data will be deleted within 30 days.",
    });
  } catch (err: any) {
    console.error("Error revoking credentials:", err);
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (sessionId) {
      deleteSession(sessionId);
      cookieStore.delete("sessionId");
    }
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to revoke credentials. Contact privacy@zondiscounts.com",
      },
      { status: 500 }
    );
  }
}

