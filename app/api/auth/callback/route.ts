import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getOAuthClient } from "@/lib/auth";
import { getSession, setSession, generateSessionId } from "@/lib/session";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const oAuthClient = getOAuthClient();
    const { tokens } = await oAuthClient.getToken(code);
    
    oAuthClient.setCredentials(tokens);

    // Get or create session
    const cookieStore = await cookies();
    let sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      sessionId = generateSessionId();
      cookieStore.set("sessionId", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    setSession(sessionId, {
      authenticated: true,
      tokens: tokens as { access_token?: string | null; refresh_token?: string | null; [key: string]: any },
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
  }
}

