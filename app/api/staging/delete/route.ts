import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { deleteStagingFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Delete a file from staging area
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("sessionId")?.value;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName");
    const type = searchParams.get("type") as "video" | "thumbnail" | null;

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName parameter is required" },
        { status: 400 }
      );
    }

    if (!type || (type !== "video" && type !== "thumbnail")) {
      return NextResponse.json(
        { error: "type parameter must be 'video' or 'thumbnail'" },
        { status: 400 }
      );
    }

    const deleted = deleteStagingFile(fileName, session.userId, sessionId, type);

    if (!deleted) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete staging file error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete file" },
      { status: 500 }
    );
  }
}



