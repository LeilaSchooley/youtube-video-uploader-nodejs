import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET - List all available channels (user directories) that the user can access
 */
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

    const session = getSession(sessionId);
    if (!session || !session.authenticated) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "uploads");

    if (!fs.existsSync(uploadsDir)) {
      return NextResponse.json({
        channels: [],
        currentChannel: session.userId?.replace(/[^a-zA-Z0-9._-]/g, "_"),
      });
    }

    // List all directories in uploads folder
    const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
    const channels = [];

    const currentSafeUserId = session.userId?.replace(/[^a-zA-Z0-9._-]/g, "_");

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(uploadsDir, entry.name);
        
        // Count files in this directory
        let fileCount = 0;
        let hasStaging = false;
        let jobCount = 0;

        try {
          const subEntries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory()) {
              if (sub.name === "staging") {
                hasStaging = true;
                // Count staging files
                const stagingPath = path.join(dirPath, "staging");
                const videosPath = path.join(stagingPath, "videos");
                const thumbnailsPath = path.join(stagingPath, "thumbnails");
                
                if (fs.existsSync(videosPath)) {
                  fileCount += fs.readdirSync(videosPath).length;
                }
                if (fs.existsSync(thumbnailsPath)) {
                  fileCount += fs.readdirSync(thumbnailsPath).length;
                }
              } else {
                jobCount++;
                // Count job files
                const jobPath = path.join(dirPath, sub.name);
                const videosPath = path.join(jobPath, "videos");
                const thumbnailsPath = path.join(jobPath, "thumbnails");
                
                if (fs.existsSync(videosPath)) {
                  fileCount += fs.readdirSync(videosPath).length;
                }
                if (fs.existsSync(thumbnailsPath)) {
                  fileCount += fs.readdirSync(thumbnailsPath).length;
                }
              }
            }
          }
        } catch (e) {
          // Ignore errors reading subdirectories
        }

        // Create a display name from the userId
        let displayName = entry.name;
        if (entry.name.includes("@")) {
          // It's an email, extract the readable part
          displayName = entry.name.split("@")[0];
        } else if (entry.name.includes("_")) {
          // It's a sanitized email, try to reconstruct
          displayName = entry.name.replace(/_/g, ".");
        }

        channels.push({
          userId: entry.name,
          displayName: displayName.length > 30 ? displayName.substring(0, 30) + "..." : displayName,
          fileCount,
          jobCount,
          hasStaging,
          isCurrent: entry.name === currentSafeUserId,
        });
      }
    }

    // Sort: current channel first, then by file count (descending)
    channels.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return b.fileCount - a.fileCount;
    });

    return NextResponse.json({
      channels,
      currentChannel: currentSafeUserId,
    });
  } catch (error: any) {
    console.error("[CHANNELS] Error listing channels:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list channels" },
      { status: 500 }
    );
  }
}

