import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";

/**
 * Get Google Drive client
 */
export function getDriveClient(auth: OAuth2Client) {
  return google.drive({ version: "v3", auth });
}

/**
 * Check if a string looks like a Google Drive file ID
 */
export function isDriveFileId(str: string): boolean {
  // Drive file IDs are typically 33 characters, alphanumeric
  // But can vary, so check for common patterns
  return /^[a-zA-Z0-9_-]{25,}$/.test(str);
}

/**
 * List video files in a Google Drive folder
 */
export async function listDriveVideos(
  folderId: string,
  auth: OAuth2Client
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
}>> {
  const drive = getDriveClient(auth);
  
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed=false`,
      fields: "files(id, name, mimeType, size, webViewLink, modifiedTime)",
      pageSize: 1000,
      orderBy: "name",
    });

    const files = response.data.files || [];
    return files
      .filter((file): file is { id: string; name: string; mimeType: string; size?: string; webViewLink?: string; modifiedTime?: string } => 
        !!file.id && !!file.name && !!file.mimeType
      )
      .map(file => ({
        id: file.id!,
        name: file.name!,
        mimeType: file.mimeType!,
        size: file.size || undefined,
        webViewLink: file.webViewLink || undefined,
        modifiedTime: file.modifiedTime || undefined,
      }));
  } catch (error: any) {
    console.error("[DRIVE] Error listing videos:", error?.message);
    throw new Error(`Failed to list Drive videos: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Recursively list all video files in a Drive folder (including subfolders)
 */
export async function listDriveVideosRecursive(
  folderId: string,
  auth: OAuth2Client,
  maxDepth: number = 10
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
  folderPath?: string;
}>> {
  const drive = getDriveClient(auth);
  const videos: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
    modifiedTime?: string;
    folderPath?: string;
  }> = [];

  async function scanFolder(folderId: string, path: string = "", depth: number = 0): Promise<void> {
    if (depth > maxDepth) {
      console.warn(`[DRIVE] Max depth ${maxDepth} reached at ${path}`);
      return;
    }

    try {
      // Get all files and folders in this folder
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, size, webViewLink, modifiedTime)",
        pageSize: 1000,
      });

      const items = response.data.files || [];

      for (const item of items) {
        // Skip items without required fields
        if (!item.id || !item.name || !item.mimeType) {
          continue;
        }

        const currentPath = path ? `${path}/${item.name}` : item.name;

        if (item.mimeType === "application/vnd.google-apps.folder") {
          // Recursively scan subfolder
          await scanFolder(item.id, currentPath, depth + 1);
        } else if (item.mimeType.includes("video/")) {
          // Add video to list
          videos.push({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            size: item.size || undefined,
            webViewLink: item.webViewLink || undefined,
            modifiedTime: item.modifiedTime || undefined,
            folderPath: path,
          });
        }
      }
    } catch (error: any) {
      console.error(`[DRIVE] Error scanning folder ${path}:`, error?.message);
      throw error;
    }
  }

  await scanFolder(folderId);
  return videos;
}

/**
 * Download a file from Google Drive as a stream
 */
export async function downloadDriveFile(
  fileId: string,
  auth: OAuth2Client
): Promise<Readable> {
  const drive = getDriveClient(auth);
  
  try {
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return response.data as Readable;
  } catch (error: any) {
    console.error(`[DRIVE] Error downloading file ${fileId}:`, error?.message);
    throw new Error(`Failed to download Drive file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Get file metadata from Drive
 */
export async function getDriveFileMetadata(
  fileId: string,
  auth: OAuth2Client
): Promise<{
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
}> {
  const drive = getDriveClient(auth);
  
  try {
    const response = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size, webViewLink, modifiedTime",
    });

    return response.data as any;
  } catch (error: any) {
    console.error(`[DRIVE] Error getting metadata for ${fileId}:`, error?.message);
    throw new Error(`Failed to get Drive file metadata: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Rename a file in Drive (post-upload action)
 */
export async function renameDriveFile(
  fileId: string,
  newName: string,
  auth: OAuth2Client
): Promise<void> {
  const drive = getDriveClient(auth);
  
  try {
    await drive.files.update({
      fileId,
      requestBody: { name: newName },
    });
    console.log(`[DRIVE] Renamed file ${fileId} to ${newName}`);
  } catch (error: any) {
    console.error(`[DRIVE] Error renaming file ${fileId}:`, error?.message);
    throw new Error(`Failed to rename Drive file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Move a file to another folder in Drive
 */
export async function moveDriveFile(
  fileId: string,
  targetFolderId: string,
  auth: OAuth2Client
): Promise<void> {
  const drive = getDriveClient(auth);
  
  try {
    // Get current parents
    const file = await drive.files.get({
      fileId,
      fields: "parents",
    });
    
    const previousParents = (file.data.parents || []).join(",");
    
    // Move file
    await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: previousParents,
    });
    console.log(`[DRIVE] Moved file ${fileId} to folder ${targetFolderId}`);
  } catch (error: any) {
    console.error(`[DRIVE] Error moving file ${fileId}:`, error?.message);
    throw new Error(`Failed to move Drive file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Delete a file from Drive
 */
export async function deleteDriveFile(
  fileId: string,
  auth: OAuth2Client
): Promise<void> {
  const drive = getDriveClient(auth);
  
  try {
    await drive.files.delete({ fileId });
    console.log(`[DRIVE] Deleted file ${fileId}`);
  } catch (error: any) {
    console.error(`[DRIVE] Error deleting file ${fileId}:`, error?.message);
    throw new Error(`Failed to delete Drive file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Get folder metadata
 */
export async function getDriveFolderMetadata(
  folderId: string,
  auth: OAuth2Client
): Promise<{
  id: string;
  name: string;
  webViewLink?: string;
}> {
  const drive = getDriveClient(auth);
  
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: "id, name, webViewLink",
    });

    return response.data as any;
  } catch (error: any) {
    console.error(`[DRIVE] Error getting folder metadata ${folderId}:`, error?.message);
    throw new Error(`Failed to get Drive folder metadata: ${error?.message || "Unknown error"}`);
  }
}
