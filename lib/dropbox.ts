import { Dropbox, DropboxAuth } from "dropbox";
import { Readable } from "stream";

// Create a fetch wrapper that adds .buffer() method to Response
// This allows us to use native fetch (or node-fetch) while providing .buffer()
async function fetchWithBuffer(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  // Use node-fetch for compatibility
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFetch = require('node-fetch');
  const fetchFn = nodeFetch.default || nodeFetch;
  
  if (typeof fetchFn !== 'function') {
    console.error('[DROPBOX] fetchFn is not a function:', typeof fetchFn);
    throw new Error('node-fetch is not available');
  }
  
  const response = await fetchFn(url, init);
  
  // Add .buffer() method if it doesn't exist (for native fetch compatibility)
  if (!response.buffer && response.arrayBuffer) {
    response.buffer = async function() {
      const arrayBuffer = await this.arrayBuffer();
      return Buffer.from(arrayBuffer);
    };
  }
  
  return response;
}

/**
 * Get Dropbox client with proper fetch configuration
 * We explicitly create the DropboxAuth with fetch to avoid SDK's internal require issues
 */
export function getDropboxClient(accessToken: string): Dropbox {
  // Create auth with explicit fetch to ensure it's available
  const auth = new DropboxAuth({
    accessToken,
    fetch: fetchWithBuffer,
  });
  
  return new Dropbox({ 
    auth,
    fetch: fetchWithBuffer,
  });
}

/**
 * Check if a string looks like a Dropbox file path
 */
export function isDropboxPath(str: string): boolean {
  // Dropbox paths start with / and contain valid path characters
  return typeof str === 'string' && str.startsWith('/') && str.length > 1;
}

/**
 * List video files in a Dropbox folder
 */
export async function listDropboxVideos(
  folderPath: string,
  accessToken: string
): Promise<Array<{
  id: string; // Dropbox uses path as ID
  name: string;
  mimeType: string;
  size?: number;
  pathLower?: string;
  modifiedTime?: string;
}>> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    // Normalize path for Dropbox API (empty string for root, no trailing slash for subfolders)
    let normalizedPath = folderPath.trim();
    if (normalizedPath === "/" || normalizedPath === "") {
      normalizedPath = "";
    } else {
      normalizedPath = normalizedPath.replace(/\/+$/, "");
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
      }
    }
    
    const response = await dbx.filesListFolder({ path: normalizedPath });
    
    if (!response.result.entries) {
      return [];
    }

    // Filter for video files
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
    const allEntries: any[] = [...response.result.entries];

    // Handle pagination - Dropbox API returns up to 2000 entries per page
    let cursor: string | undefined = response.result.has_more ? response.result.cursor : undefined;
    while (cursor) {
      const nextResponse = await dbx.filesListFolderContinue({ cursor });
      if (!nextResponse.result.entries) break;
      
      allEntries.push(...nextResponse.result.entries);
      cursor = nextResponse.result.has_more && nextResponse.result.cursor ? nextResponse.result.cursor : undefined;
    }

    const videoFiles = allEntries.filter(entry => {
      if (entry['.tag'] !== 'file') return false;
      const file = entry as any;
      const name = file.name?.toLowerCase() || '';
      return videoExtensions.some(ext => name.endsWith(ext));
    });

    console.log(`[DROPBOX] Found ${videoFiles.length} videos in folder (scanned ${allEntries.length} total files)`);

    return videoFiles.map((entry: any) => ({
      id: entry.path_lower || entry.path_display || entry.id,
      name: entry.name,
      mimeType: entry.content_hash ? 'video/mp4' : 'application/octet-stream', // Dropbox doesn't always provide mimeType
      size: entry.size,
      pathLower: entry.path_lower,
      modifiedTime: entry.server_modified,
    }));
  } catch (error: any) {
    console.error("[DROPBOX] Error listing videos:", error?.message);
    throw new Error(`Failed to list Dropbox videos: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Recursively list all video files in a Dropbox folder (including subfolders)
 */
export async function listDropboxVideosRecursive(
  folderPath: string,
  accessToken: string,
  maxDepth: number = 10
): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  pathLower?: string;
  modifiedTime?: string;
  folderPath?: string;
}>> {
  const dbx = getDropboxClient(accessToken);
  const videos: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    pathLower?: string;
    modifiedTime?: string;
    folderPath?: string;
  }> = [];

  async function scanFolder(path: string, folderPath: string = "", depth: number = 0): Promise<void> {
    if (depth > maxDepth) {
      console.warn(`[DROPBOX] Max depth ${maxDepth} reached at ${path}`);
      return;
    }

    try {
      // Normalize path for Dropbox API (empty string for root, no trailing slash for subfolders)
      let normalizedPath = path.trim();
      if (normalizedPath === "/" || normalizedPath === "") {
        normalizedPath = "";
      } else {
        normalizedPath = normalizedPath.replace(/\/+$/, "");
        if (!normalizedPath.startsWith("/")) {
          normalizedPath = "/" + normalizedPath;
        }
      }
      const response = await dbx.filesListFolder({ path: normalizedPath });

      if (!response.result.entries) {
        return;
      }

      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];

      for (const entry of response.result.entries) {
        if (entry['.tag'] === 'file') {
          const file = entry as any;
          const name = file.name?.toLowerCase() || '';
          if (videoExtensions.some(ext => name.endsWith(ext))) {
            videos.push({
              id: file.path_lower || file.path_display || file.id,
              name: file.name,
              mimeType: file.content_hash ? 'video/mp4' : 'application/octet-stream',
              size: file.size,
              pathLower: file.path_lower,
              modifiedTime: file.server_modified,
              folderPath: folderPath || '/',
            });
          }
        } else if (entry['.tag'] === 'folder') {
          const folder = entry as any;
          const subPath = folder.path_lower || folder.path_display || folder.id;
          await scanFolder(subPath, subPath, depth + 1);
        }
      }

      // Handle pagination
      if (response.result.has_more) {
        let cursor: string | undefined = response.result.cursor;
        while (cursor) {
          const nextResponse = await dbx.filesListFolderContinue({ cursor });
          if (!nextResponse.result.entries) break;

          for (const entry of nextResponse.result.entries) {
            if (entry['.tag'] === 'file') {
              const file = entry as any;
              const name = file.name?.toLowerCase() || '';
              if (videoExtensions.some(ext => name.endsWith(ext))) {
                videos.push({
                  id: file.path_lower || file.path_display || file.id,
                  name: file.name,
                  mimeType: file.content_hash ? 'video/mp4' : 'application/octet-stream',
                  size: file.size,
                  pathLower: file.path_lower,
                  modifiedTime: file.server_modified,
                  folderPath: folderPath || '/',
                });
              }
            } else if (entry['.tag'] === 'folder') {
              const folder = entry as any;
              const subPath = folder.path_lower || folder.path_display || folder.id;
              await scanFolder(subPath, subPath, depth + 1);
            }
          }

          cursor = nextResponse.result.has_more && nextResponse.result.cursor ? nextResponse.result.cursor : undefined;
        }
      }
    } catch (error: any) {
      console.error(`[DROPBOX] Error scanning folder ${path}:`, error?.message);
      // Continue with other folders
    }
  }

  await scanFolder(folderPath);
  return videos;
}

/**
 * Download a file from Dropbox as a stream
 * Automatically refreshes token if it expires (401 error)
 */
export async function downloadDropboxFile(
  filePath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null
): Promise<Readable> {
  console.log(`[DROPBOX] Downloading file: ${filePath}`);
  console.log(`[DROPBOX] Token available: ${!!accessToken}, Token length: ${accessToken?.length || 0}`);
  
  const dbx = getDropboxClient(accessToken);
  
  try {
    console.log(`[DROPBOX] Calling filesDownload for: ${filePath}`);
    const response = await dbx.filesDownload({ path: filePath });
    console.log(`[DROPBOX] Got response, result keys:`, Object.keys(response.result || {}));
    
    // Dropbox SDK v10+ returns result with fileBinary property
    // Handle both Buffer and Uint8Array formats
    let fileData: Buffer | Uint8Array | undefined;
    
    if (response.result && typeof response.result === 'object') {
      const result = response.result as any;
      // Try different possible properties
      fileData = result.fileBinary || result.fileContents || result.data;
      
      console.log(`[DROPBOX] File data type: ${typeof fileData}, isBuffer: ${Buffer.isBuffer(fileData)}, isUint8Array: ${fileData instanceof Uint8Array}`);
      
      // If it's a Uint8Array, convert to Buffer
      if (fileData instanceof Uint8Array && !Buffer.isBuffer(fileData)) {
        fileData = Buffer.from(fileData);
      }
    }
    
    if (!fileData) {
      console.error(`[DROPBOX] Response structure:`, JSON.stringify(Object.keys(response.result || {})));
      throw new Error("No file data returned from Dropbox - unexpected response structure");
    }

    // Convert to Buffer if not already
    const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
    console.log(`[DROPBOX] Successfully downloaded file, size: ${buffer.length} bytes`);
    
    // Convert Buffer to Readable stream
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // End the stream
    
    return stream;
  } catch (error: any) {
    // Check if it's a 401 error (expired token) and we have refresh token
    const is401 = error?.status === 401 || 
                  error?.statusCode === 401 ||
                  error?.error?.error?.['.tag'] === 'expired_access_token' ||
                  error?.error?.error_summary?.includes('expired_access_token');
    
    if (is401 && sessionId && sessionRefreshToken) {
      console.log(`[DROPBOX] Token expired during download (401), attempting refresh...`);
      try {
        const { refreshDropboxTokenIfNeeded } = await import("./auth");
        const newToken = await refreshDropboxTokenIfNeeded(error, sessionId, sessionRefreshToken);
        
        if (newToken) {
          // Retry with new token
          console.log(`[DROPBOX] Retrying download with refreshed token...`);
          return downloadDropboxFile(filePath, newToken, sessionId, sessionRefreshToken);
        }
      } catch (refreshError: any) {
        console.error(`[DROPBOX] Token refresh failed:`, refreshError?.message || refreshError);
        // Fall through to throw original error
      }
    }
    
    console.error(`[DROPBOX] Error downloading file ${filePath}:`, error?.message);
    console.error(`[DROPBOX] Error details:`, error?.error || error);
    if (error?.status) {
      console.error(`[DROPBOX] HTTP Status:`, error.status);
    }
    throw new Error(`Failed to download Dropbox file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Get file metadata from Dropbox
 */
export async function getDropboxFileMetadata(
  filePath: string,
  accessToken: string
): Promise<{
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  pathLower?: string;
  modifiedTime?: string;
}> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    const response = await dbx.filesGetMetadata({ path: filePath });
    const file = response.result as any;
    
    return {
      id: file.path_lower || file.path_display || file.id,
      name: file.name,
      mimeType: file.content_hash ? 'video/mp4' : 'application/octet-stream',
      size: file.size,
      pathLower: file.path_lower,
      modifiedTime: file.server_modified,
    };
  } catch (error: any) {
    console.error(`[DROPBOX] Error getting metadata for ${filePath}:`, error?.message);
    throw new Error(`Failed to get Dropbox file metadata: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Rename a file in Dropbox (post-upload action)
 */
export async function renameDropboxFile(
  filePath: string,
  newName: string,
  accessToken: string
): Promise<void> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    // Get directory path
    const pathParts = filePath.split('/');
    pathParts.pop(); // Remove filename
    const directory = pathParts.join('/') || '/';
    const newPath = `${directory}/${newName}`;
    
    await dbx.filesMoveV2({
      from_path: filePath,
      to_path: newPath,
    });
    console.log(`[DROPBOX] Renamed file ${filePath} to ${newPath}`);
  } catch (error: any) {
    console.error(`[DROPBOX] Error renaming file ${filePath}:`, error?.message);
    throw new Error(`Failed to rename Dropbox file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Move a file to another folder in Dropbox
 */
export async function moveDropboxFile(
  filePath: string,
  targetFolderPath: string,
  accessToken: string
): Promise<void> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    // Get filename
    const pathParts = filePath.split('/');
    const filename = pathParts[pathParts.length - 1];
    const targetPath = `${targetFolderPath.endsWith('/') ? targetFolderPath.slice(0, -1) : targetFolderPath}/${filename}`;
    
    await dbx.filesMoveV2({
      from_path: filePath,
      to_path: targetPath,
    });
    console.log(`[DROPBOX] Moved file ${filePath} to ${targetPath}`);
  } catch (error: any) {
    console.error(`[DROPBOX] Error moving file ${filePath}:`, error?.message);
    throw new Error(`Failed to move Dropbox file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Delete a file from Dropbox
 */
export async function deleteDropboxFile(
  filePath: string,
  accessToken: string
): Promise<void> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    await dbx.filesDeleteV2({ path: filePath });
    console.log(`[DROPBOX] Deleted file ${filePath}`);
  } catch (error: any) {
    console.error(`[DROPBOX] Error deleting file ${filePath}:`, error?.message);
    throw new Error(`Failed to delete Dropbox file: ${error?.message || "Unknown error"}`);
  }
}

/**
 * List all items in a Dropbox folder (for folder browser)
 */
export async function listDropboxItems(
  folderPath: string,
  accessToken: string
): Promise<Array<{
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  modifiedTime?: string;
}>> {
  const dbx = getDropboxClient(accessToken);
  
  try {
    // Dropbox API expects "" for root, and paths without trailing slash for subfolders
    // Root folder: "/" or "" -> ""
    // Subfolders: "/Videos" or "/Videos/" -> "/Videos"
    let normalizedPath = folderPath.trim();
    
    // Handle root folder - Dropbox API expects empty string
    if (normalizedPath === "/" || normalizedPath === "") {
      normalizedPath = "";
    } else {
      // Remove trailing slash for non-root folders
      normalizedPath = normalizedPath.replace(/\/+$/, "");
      // Ensure path starts with /
      if (!normalizedPath.startsWith("/")) {
        normalizedPath = "/" + normalizedPath;
      }
    }
    
    console.log(`[DROPBOX] Listing items in folder: "${normalizedPath}"`);
    
    // Collect all items with pagination support
    const allItems: Array<{
      id: string;
      name: string;
      type: 'file' | 'folder';
      size?: number;
      modifiedTime?: string;
    }> = [];
    
    // Initial request
    let response = await dbx.filesListFolder({ path: normalizedPath });
    
    const processEntries = (entries: any[]) => {
      for (const entry of entries) {
        allItems.push({
          id: entry.path_lower || entry.path_display || entry.id,
          name: entry.name,
          type: entry['.tag'] === 'folder' ? 'folder' : 'file',
          size: entry.size,
          modifiedTime: entry.server_modified,
        });
      }
    };
    
    if (response.result.entries) {
      processEntries(response.result.entries);
    }
    
    // Handle pagination - fetch remaining items
    while (response.result.has_more) {
      console.log(`[DROPBOX] Fetching more items... (current count: ${allItems.length})`);
      response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
      if (response.result.entries) {
        processEntries(response.result.entries);
      }
    }
    
    console.log(`[DROPBOX] Total items fetched: ${allItems.length}`);
    return allItems;
  } catch (error: any) {
    // Log full error details for debugging
    console.error("[DROPBOX] Error listing items:", error?.message);
    console.error("[DROPBOX] Error details:", JSON.stringify({
      status: error?.status,
      error: error?.error,
      message: error?.message,
      headers: error?.headers,
    }, null, 2));
    
    // Extract more specific error message from Dropbox API response
    let errorMessage = error?.message || "Unknown error";
    if (error?.error?.error_summary) {
      errorMessage = error.error.error_summary;
    } else if (error?.error?.error?.['.tag']) {
      errorMessage = `${error.error.error['.tag']}: ${JSON.stringify(error.error.error)}`;
    }
    
    throw new Error(`Failed to list Dropbox items: ${errorMessage}`);
  }
}
