import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUploadProgress } from "@/lib/upload-progress";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const uploadSessionId = searchParams.get("sessionId") || sessionId;

    const progress = getUploadProgress(uploadSessionId);

    if (!progress) {
      return NextResponse.json(
        { error: "No progress found" },
        { status: 404 }
      );
    }

    return NextResponse.json(progress);
  } catch (error: any) {
    console.error("Get upload progress error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get upload progress" },
      { status: 500 }
    );
  }
}

