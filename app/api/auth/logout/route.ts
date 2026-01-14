import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { deleteSession } from "@/lib/session";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("sessionId")?.value;
  
  if (sessionId) {
    deleteSession(sessionId);
    cookieStore.delete("sessionId");
  }

  return NextResponse.redirect(new URL("/", request.url));
}

