import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, setSession } from "@/lib/session";
import { clearDriveTokensForUser } from "@/lib/drive-by-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    if (session.userId) {
      clearDriveTokensForUser(session.userId);
    }
    setSession(sessionId, {
      ...session,
      driveTokens: undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Disconnect failed";
    console.error("[DRIVE DISCONNECT]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
