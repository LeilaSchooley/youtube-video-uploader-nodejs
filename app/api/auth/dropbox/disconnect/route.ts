import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, setSession } from "@/lib/session";
import { clearDropboxTokensForUser } from "@/lib/dropbox-by-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Clear Dropbox OAuth tokens for the current session and persisted-by-user store.
 */
export async function POST() {
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

    const userId = session.userId;
    if (userId) {
      clearDropboxTokensForUser(userId);
    }

    setSession(sessionId, {
      ...session,
      dropboxToken: undefined,
      dropboxRefreshToken: undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Disconnect failed";
    console.error("[DROPBOX DISCONNECT]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
