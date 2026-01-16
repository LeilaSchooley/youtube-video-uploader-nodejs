import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET - List all available user directories in uploads folder
 * This helps users see which directories contain their files
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
        directories: [],
        currentUserId: session.userId,
      });
    }

    // List all directories in uploads folder
    const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
    const directories = [];

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

        directories.push({
          name: entry.name,
          hasStaging,
          jobCount,
          fileCount,
          isCurrentUser: session.userId && 
            entry.name === session.userId.replace(/[^a-zA-Z0-9._-]/g, "_"),
        });
      }
    }

    return NextResponse.json({
      directories,
      currentUserId: session.userId,
      currentSafeUserId: session.userId?.replace(/[^a-zA-Z0-9._-]/g, "_"),
    });
  } catch (error: any) {
    console.error("[MIGRATE-FILES] Error listing directories:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to list directories" },
      { status: 500 }
    );
  }
}

/**
 * POST - Migrate files from one directory to another
 * Copies all files from source to destination (merges if destination exists)
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { sourceDir, destDir, deleteSource } = body;

    if (!sourceDir || !destDir) {
      return NextResponse.json(
        { error: "sourceDir and destDir are required" },
        { status: 400 }
      );
    }

    if (sourceDir === destDir) {
      return NextResponse.json(
        { error: "Source and destination cannot be the same" },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    const sourcePath = path.join(uploadsDir, sourceDir);
    const destPath = path.join(uploadsDir, destDir);

    // Security: Ensure paths are within uploads directory
    const normalizedSource = path.normalize(sourcePath);
    const normalizedDest = path.normalize(destPath);
    const normalizedUploads = path.normalize(uploadsDir);

    if (!normalizedSource.startsWith(normalizedUploads) || 
        !normalizedDest.startsWith(normalizedUploads)) {
      return NextResponse.json(
        { error: "Invalid directory path" },
        { status: 400 }
      );
    }

    if (!fs.existsSync(sourcePath)) {
      return NextResponse.json(
        { error: `Source directory not found: ${sourceDir}` },
        { status: 404 }
      );
    }

    // Create destination if it doesn't exist
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    // Recursively copy all files and directories
    const copyRecursive = (src: string, dest: string): number => {
      let filesCopied = 0;
      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destEntryPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          if (!fs.existsSync(destEntryPath)) {
            fs.mkdirSync(destEntryPath, { recursive: true });
          }
          filesCopied += copyRecursive(srcPath, destEntryPath);
        } else {
          // Copy file (overwrite if exists)
          fs.copyFileSync(srcPath, destEntryPath);
          filesCopied++;
        }
      }

      return filesCopied;
    };

    const filesCopied = copyRecursive(sourcePath, destPath);

    // Optionally delete source directory
    if (deleteSource) {
      fs.rmSync(sourcePath, { recursive: true, force: true });
    }

    console.log(`[MIGRATE-FILES] Migrated ${filesCopied} files from ${sourceDir} to ${destDir}, deleteSource=${deleteSource}`);

    return NextResponse.json({
      success: true,
      filesCopied,
      sourceDeleted: !!deleteSource,
      message: `Migrated ${filesCopied} files from ${sourceDir} to ${destDir}`,
    });
  } catch (error: any) {
    console.error("[MIGRATE-FILES] Error migrating files:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to migrate files" },
      { status: 500 }
    );
  }
}

