import { Dropbox, DropboxAuth } from "dropbox";
import { Readable } from "stream";

// Create a fetch wrapper that adds .buffer() method to Response
// This allows us to use native fetch (or node-fetch) while providing .buffer()
async function fetchWithBuffer(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  // Use node-fetch for compatibility
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFetch = require("node-fetch");
  const fetchFn = nodeFetch.default || nodeFetch;

  if (typeof fetchFn !== "function") {
    console.error("[DROPBOX] fetchFn is not a function:", typeof fetchFn);
    throw new Error("node-fetch is not available");
  }

  const response = await fetchFn(url, init);

  // Add .buffer() method if it doesn't exist (for native fetch compatibility)
  if (!response.buffer && response.arrayBuffer) {
    response.buffer = async function () {
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
  return typeof str === "string" && str.startsWith("/") && str.length > 1;
}

/**
 * Handle 401 errors for Dropbox API calls - attempt to refresh OAuth token.
 */
async function handleDropbox401Error(
  error: any,
  _accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
  operation: string = "operation",
): Promise<string | null> {
  const is401 =
    error?.status === 401 ||
    error?.statusCode === 401 ||
    error?.error?.error?.[".tag"] === "expired_access_token" ||
    error?.error?.error_summary?.includes("expired_access_token");

  if (!is401) {
    return null;
  }

  // Try to refresh OAuth token
  if (sessionId && sessionRefreshToken) {
    console.log(
      `[DROPBOX] OAuth token expired during ${operation} (401), attempting refresh...`,
    );
    console.log(`[DROPBOX] Session ID: ${sessionId}`);
    console.log(`[DROPBOX] Refresh token available: ${!!sessionRefreshToken}`);
    try {
      const { refreshDropboxTokenIfNeeded } = await import("./auth");
      const newToken = await refreshDropboxTokenIfNeeded(
        error,
        sessionId,
        sessionRefreshToken,
      );

      if (newToken) {
        console.log(`[DROPBOX] ✓ Successfully refreshed OAuth token`);
        console.log(
          `[DROPBOX] New token length: ${newToken.length}, starts with: ${newToken.substring(0, 15)}...`,
        );
        console.log(`[DROPBOX] Retrying ${operation} with refreshed token...`);
        return newToken;
      } else {
        console.error(`[DROPBOX] ✗ Token refresh returned null/undefined`);
      }
    } catch (refreshError: any) {
      console.error(
        `[DROPBOX] ✗ Token refresh failed:`,
        refreshError?.message || refreshError,
      );
      console.error(
        `[DROPBOX] Refresh error details:`,
        JSON.stringify(
          {
            message: refreshError?.message,
            stack: refreshError?.stack,
          },
          null,
          2,
        ),
      );
    }
  } else {
    console.error(
      `[DROPBOX] Cannot refresh token: sessionId=${!!sessionId}, sessionRefreshToken=${!!sessionRefreshToken}`,
    );
  }

  console.log(`[DROPBOX] Returning null from handleDropbox401Error`);
  return null;
}

/**
 * List video files in a Dropbox folder
 * Automatically refreshes token if it expires (401 error)
 */
export async function listDropboxVideos(
  folderPath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<
  Array<{
    id: string; // Dropbox uses path as ID
    name: string;
    mimeType: string;
    size?: number;
    pathLower?: string;
    modifiedTime?: string;
  }>
> {
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
    const videoExtensions = [
      ".mp4",
      ".mov",
      ".avi",
      ".mkv",
      ".webm",
      ".flv",
      ".wmv",
      ".m4v",
    ];
    const allEntries: any[] = [...response.result.entries];

    // Handle pagination - Dropbox API returns up to 2000 entries per page
    let cursor: string | undefined = response.result.has_more
      ? response.result.cursor
      : undefined;
    while (cursor) {
      const nextResponse = await dbx.filesListFolderContinue({ cursor });
      if (!nextResponse.result.entries) break;

      allEntries.push(...nextResponse.result.entries);
      cursor =
        nextResponse.result.has_more && nextResponse.result.cursor
          ? nextResponse.result.cursor
          : undefined;
    }

    const videoFiles = allEntries.filter((entry) => {
      if (entry[".tag"] !== "file") return false;
      const file = entry as any;
      const name = file.name?.toLowerCase() || "";
      return videoExtensions.some((ext) => name.endsWith(ext));
    });

    console.log(
      `[DROPBOX] Found ${videoFiles.length} videos in folder (scanned ${allEntries.length} total files)`,
    );

    return videoFiles.map((entry: any) => ({
      id: entry.path_lower || entry.path_display || entry.id,
      name: entry.name,
      mimeType: entry.content_hash ? "video/mp4" : "application/octet-stream", // Dropbox doesn't always provide mimeType
      size: entry.size,
      pathLower: entry.path_lower,
      modifiedTime: entry.server_modified,
    }));
  } catch (error: any) {
    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "list videos",
    );
    if (newToken) {
      // Retry with new token
      return listDropboxVideos(
        folderPath,
        newToken,
        sessionId,
        sessionRefreshToken,
      );
    }

    console.error("[DROPBOX] Error listing videos:", error?.message);
    throw new Error(
      `Failed to list Dropbox videos: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Recursively list all video files in a Dropbox folder (including subfolders)
 * Automatically refreshes token if it expires (401 error)
 */
export async function listDropboxVideosRecursive(
  folderPath: string,
  accessToken: string,
  maxDepth: number = 10,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<
  Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    pathLower?: string;
    modifiedTime?: string;
    folderPath?: string;
  }>
> {
  let dbx = getDropboxClient(accessToken);
  let currentToken = accessToken;
  const videos: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    pathLower?: string;
    modifiedTime?: string;
    folderPath?: string;
  }> = [];

  async function scanFolder(
    path: string,
    folderPath: string = "",
    depth: number = 0,
  ): Promise<void> {
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

      const videoExtensions = [
        ".mp4",
        ".mov",
        ".avi",
        ".mkv",
        ".webm",
        ".flv",
        ".wmv",
        ".m4v",
      ];

      for (const entry of response.result.entries) {
        if (entry[".tag"] === "file") {
          const file = entry as any;
          const name = file.name?.toLowerCase() || "";
          if (videoExtensions.some((ext) => name.endsWith(ext))) {
            videos.push({
              id: file.path_lower || file.path_display || file.id,
              name: file.name,
              mimeType: file.content_hash
                ? "video/mp4"
                : "application/octet-stream",
              size: file.size,
              pathLower: file.path_lower,
              modifiedTime: file.server_modified,
              folderPath: folderPath || "/",
            });
          }
        } else if (entry[".tag"] === "folder") {
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
            if (entry[".tag"] === "file") {
              const file = entry as any;
              const name = file.name?.toLowerCase() || "";
              if (videoExtensions.some((ext) => name.endsWith(ext))) {
                videos.push({
                  id: file.path_lower || file.path_display || file.id,
                  name: file.name,
                  mimeType: file.content_hash
                    ? "video/mp4"
                    : "application/octet-stream",
                  size: file.size,
                  pathLower: file.path_lower,
                  modifiedTime: file.server_modified,
                  folderPath: folderPath || "/",
                });
              }
            } else if (entry[".tag"] === "folder") {
              const folder = entry as any;
              const subPath =
                folder.path_lower || folder.path_display || folder.id;
              await scanFolder(subPath, subPath, depth + 1);
            }
          }

          cursor =
            nextResponse.result.has_more && nextResponse.result.cursor
              ? nextResponse.result.cursor
              : undefined;
        }
      }
    } catch (error: any) {
      // Handle 401 errors (token refresh)
      const newToken = await handleDropbox401Error(
        error,
        currentToken,
        sessionId,
        sessionRefreshToken,
        "recursive scan",
      );
      if (newToken) {
        // Update token and client, then retry
        currentToken = newToken;
        dbx = getDropboxClient(newToken);
        // Retry the folder scan
        await scanFolder(path, folderPath, depth);
        return;
      }

      console.error(`[DROPBOX] Error scanning folder ${path}:`, error?.message);
      // Continue with other folders
    }
  }

  await scanFolder(folderPath);
  return videos;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backoff delay for Dropbox 429 / 503 (shared by upload + download paths).
 * Honors Dropbox `retry_after`, HTTP Retry-After, and exponential backoff.
 */
function dropboxRateLimitRetryDelayMs(error: any, attempt: number): number {
  let retryAfterMs = Math.min(10000 * attempt, 120000);
  const retryAfterSec =
    typeof error?.error?.error?.retry_after === "number"
      ? error.error.error.retry_after
      : typeof error?.error?.retry_after === "number"
        ? error.error.retry_after
        : undefined;
  if (retryAfterSec != null && retryAfterSec >= 0) {
    retryAfterMs = Math.max(retryAfterMs, retryAfterSec * 1000);
  }
  const retryAfterHeader =
    error?.response?.headers?.["retry-after"] ??
    error?.response?.headers?.["Retry-After"] ??
    error?.headers?.["retry-after"] ??
    error?.headers?.["Retry-After"] ??
    error?.response?.headers?.get?.("retry-after") ??
    error?.response?.headers?.get?.("Retry-After");
  if (retryAfterHeader) {
    const parsed = parseInt(String(retryAfterHeader), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      retryAfterMs = Math.max(retryAfterMs, parsed * 1000);
    }
  }
  const MIN_RETRY_MS = 2000;
  retryAfterMs = Math.max(retryAfterMs, MIN_RETRY_MS);
  retryAfterMs = Math.min(retryAfterMs, 300000);
  return retryAfterMs;
}

/** TCP / TLS drops (ECONNRESET, etc.) — retry with backoff, not user error. */
function isTransientDropboxNetworkError(error: unknown): boolean {
  const msg = String(
    (error as { message?: string })?.message ?? error ?? "",
  ).toLowerCase();
  const code = (error as { code?: string })?.code;
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  return /econnreset|etimedout|socket hang up|econnrefused|network|fetch failed/i.test(
    msg,
  );
}

/**
 * Download a file from Dropbox as a stream
 * Automatically refreshes token if it expires (401 error).
 * Retries on 429 / 503 with backoff (same policy as uploads).
 */
export async function downloadDropboxFile(
  filePath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
  attempt = 1,
): Promise<Readable> {
  const MAX_RETRIES = 6;
  console.log(`[DROPBOX] Downloading file: ${filePath}`);
  console.log(
    `[DROPBOX] Token available: ${!!accessToken}, Token length: ${accessToken?.length || 0}`,
  );

  const dbx = getDropboxClient(accessToken);

  try {
    console.log(`[DROPBOX] Calling filesDownload for: ${filePath}`);
    const response = await dbx.filesDownload({ path: filePath });
    console.log(
      `[DROPBOX] Got response, result keys:`,
      Object.keys(response.result || {}),
    );

    // Dropbox SDK v10+ returns result with fileBinary property
    // Handle both Buffer and Uint8Array formats
    let fileData: Buffer | Uint8Array | undefined;

    if (response.result && typeof response.result === "object") {
      const result = response.result as any;
      // Try different possible properties
      fileData = result.fileBinary || result.fileContents || result.data;

      console.log(
        `[DROPBOX] File data type: ${typeof fileData}, isBuffer: ${Buffer.isBuffer(fileData)}, isUint8Array: ${fileData instanceof Uint8Array}`,
      );

      // If it's a Uint8Array, convert to Buffer
      if (fileData instanceof Uint8Array && !Buffer.isBuffer(fileData)) {
        fileData = Buffer.from(fileData);
      }
    }

    if (!fileData) {
      console.error(
        `[DROPBOX] Response structure:`,
        JSON.stringify(Object.keys(response.result || {})),
      );
      throw new Error(
        "No file data returned from Dropbox - unexpected response structure",
      );
    }

    // Convert to Buffer if not already
    const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
    console.log(
      `[DROPBOX] Successfully downloaded file, size: ${buffer.length} bytes`,
    );

    // Convert Buffer to Readable stream
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // End the stream

    return stream;
  } catch (error: any) {
    const status =
      error?.status ?? error?.statusCode ?? error?.response?.status;
    const is429 = status === 429;
    const is503 = status === 503;
    if ((is429 || is503) && attempt <= MAX_RETRIES) {
      if (attempt === 1) {
        console.log(
          `[DROPBOX] ${status} error structure (download):`,
          JSON.stringify(
            {
              status: error?.status,
              statusCode: error?.statusCode,
              responseStatus: error?.response?.status,
              error: error?.error,
            },
            null,
            2,
          ),
        );
      }
      const retryAfterMs = dropboxRateLimitRetryDelayMs(error, attempt);
      console.warn(
        `[DROPBOX] ${is503 ? "Service unavailable (503)" : "Rate limited (429)"} downloading ${filePath}, retry ${attempt}/${MAX_RETRIES} in ${Math.round(retryAfterMs / 1000)}s`,
      );
      await sleep(retryAfterMs);
      return downloadDropboxFile(
        filePath,
        accessToken,
        sessionId,
        sessionRefreshToken,
        attempt + 1,
      );
    }

    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "download",
    );
    if (newToken) {
      // Retry with new token
      return downloadDropboxFile(
        filePath,
        newToken,
        sessionId,
        sessionRefreshToken,
        1,
      );
    }

    console.error(
      `[DROPBOX] Error downloading file ${filePath}:`,
      error?.message,
    );
    console.error(`[DROPBOX] Error details:`, error?.error || error);
    if (error?.status) {
      console.error(`[DROPBOX] HTTP Status:`, error.status);
    }
    throw new Error(
      `Failed to download Dropbox file: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Upload file contents to Dropbox (overwrites existing file)
 * Automatically refreshes token if it expires (401 error).
 * Retries on 429 (rate limit) with exponential backoff.
 */
export async function uploadDropboxFile(
  filePath: string,
  contents: Buffer | Uint8Array,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
  attempt = 1,
): Promise<void> {
  const MAX_RETRIES = 6;
  const dbx = getDropboxClient(accessToken);

  try {
    const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
    await dbx.filesUpload({
      path: filePath,
      contents: buffer,
      mode: { ".tag": "overwrite" },
    });
    console.log(
      `[DROPBOX] Uploaded file: ${filePath} (${buffer.length} bytes)`,
    );
  } catch (error: any) {
    const status =
      error?.status ?? error?.statusCode ?? error?.response?.status;
    const is429 = status === 429;
    const is503 = status === 503;
    // Retry on 429 (rate limit / too_many_write_operations) or 503 (lock contention / overload)
    const shouldRetry = (is429 || is503) && attempt <= MAX_RETRIES;

    if (shouldRetry) {
      // Log error structure for debugging (first attempt only)
      if (attempt === 1) {
        console.log(
          `[DROPBOX] ${status} error structure:`,
          JSON.stringify(
            {
              status: error?.status,
              statusCode: error?.statusCode,
              responseStatus: error?.response?.status,
              error: error?.error,
              headers: error?.headers,
              responseHeaders: error?.response?.headers,
            },
            null,
            2,
          ),
        );
      }

      const retryAfterMs = dropboxRateLimitRetryDelayMs(error, attempt);

      console.warn(
        `[DROPBOX] ${is503 ? "Service unavailable (503)" : "Rate limited (429)"} uploading ${filePath}, retry ${attempt}/${MAX_RETRIES} in ${Math.round(retryAfterMs / 1000)}s`,
      );
      await sleep(retryAfterMs);
      return uploadDropboxFile(
        filePath,
        contents,
        accessToken,
        sessionId,
        sessionRefreshToken,
        attempt + 1,
      );
    }

    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "upload",
    );
    if (newToken) {
      return uploadDropboxFile(
        filePath,
        contents,
        newToken,
        sessionId,
        sessionRefreshToken,
        1,
      );
    }

    console.error(
      `[DROPBOX] Error uploading file ${filePath}:`,
      error?.message,
    );
    throw new Error(
      `Failed to upload Dropbox file: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Get file metadata from Dropbox
 * Automatically refreshes token if it expires (401 error)
 */
export async function getDropboxFileMetadata(
  filePath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
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
      mimeType: file.content_hash ? "video/mp4" : "application/octet-stream",
      size: file.size,
      pathLower: file.path_lower,
      modifiedTime: file.server_modified,
    };
  } catch (error: any) {
    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "get metadata",
    );
    if (newToken) {
      // Retry with new token
      return getDropboxFileMetadata(
        filePath,
        newToken,
        sessionId,
        sessionRefreshToken,
      );
    }

    console.error(
      `[DROPBOX] Error getting metadata for ${filePath}:`,
      error?.message,
    );
    throw new Error(
      `Failed to get Dropbox file metadata: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Create folder path recursively (ignores if a segment already exists).
 */
export async function ensureDropboxFolder(
  folderPath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<void> {
  let normalized = folderPath.trim();
  if (normalized === "" || normalized === "/") return;
  normalized = normalized.replace(/\/+$/, "");
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;

  const parts = normalized.split("/").filter(Boolean);
  let acc = "";
  let token = accessToken;

  for (const part of parts) {
    acc = `${acc}/${part}`;
    const dbx = getDropboxClient(token);
    try {
      await dbx.filesCreateFolderV2({ path: acc, autorename: false });
    } catch (error: any) {
      const summary = String(error?.error?.error_summary || "");
      if (
        summary.includes("conflict") ||
        summary.includes("path/conflict")
      ) {
        continue;
      }
      const newToken = await handleDropbox401Error(
        error,
        token,
        sessionId,
        sessionRefreshToken,
        "create folder",
      );
      if (newToken) {
        token = newToken;
        const dbx2 = getDropboxClient(token);
        try {
          await dbx2.filesCreateFolderV2({ path: acc, autorename: false });
        } catch (e2: any) {
          const s2 = String(e2?.error?.error_summary || "");
          if (s2.includes("conflict") || s2.includes("path/conflict")) continue;
          throw e2;
        }
      } else {
        throw error;
      }
    }
  }
}

/**
 * Rename a file in Dropbox (post-upload action)
 * Automatically refreshes token if it expires (401 error)
 */
export async function renameDropboxFile(
  filePath: string,
  newName: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<void> {
  const dbx = getDropboxClient(accessToken);

  try {
    // Get directory path
    const pathParts = filePath.split("/");
    pathParts.pop(); // Remove filename
    const directory = pathParts.join("/") || "/";
    const newPath = `${directory}/${newName}`;

    await dbx.filesMoveV2({
      from_path: filePath,
      to_path: newPath,
    });
    console.log(`[DROPBOX] Renamed file ${filePath} to ${newPath}`);
  } catch (error: any) {
    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "rename",
    );
    if (newToken) {
      // Retry with new token
      return renameDropboxFile(
        filePath,
        newName,
        newToken,
        sessionId,
        sessionRefreshToken,
      );
    }

    console.error(`[DROPBOX] Error renaming file ${filePath}:`, error?.message);
    throw new Error(
      `Failed to rename Dropbox file: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Move a file to another folder in Dropbox
 * Automatically refreshes token if it expires (401 error)
 */
export async function moveDropboxFile(
  filePath: string,
  targetFolderPath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<void> {
  const dbx = getDropboxClient(accessToken);

  try {
    // Get filename
    const pathParts = filePath.split("/");
    const filename = pathParts[pathParts.length - 1];
    const targetPath = `${targetFolderPath.endsWith("/") ? targetFolderPath.slice(0, -1) : targetFolderPath}/${filename}`;

    await dbx.filesMoveV2({
      from_path: filePath,
      to_path: targetPath,
    });
    console.log(`[DROPBOX] Moved file ${filePath} to ${targetPath}`);
  } catch (error: any) {
    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "move",
    );
    if (newToken) {
      // Retry with new token
      return moveDropboxFile(
        filePath,
        targetFolderPath,
        newToken,
        sessionId,
        sessionRefreshToken,
      );
    }

    console.error(`[DROPBOX] Error moving file ${filePath}:`, error?.message);
    throw new Error(
      `Failed to move Dropbox file: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * Delete a file from Dropbox
 * Automatically refreshes token if it expires (401 error)
 */
export async function deleteDropboxFile(
  filePath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
): Promise<void> {
  const dbx = getDropboxClient(accessToken);

  try {
    await dbx.filesDeleteV2({ path: filePath });
    console.log(`[DROPBOX] Deleted file ${filePath}`);
  } catch (error: any) {
    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "delete",
    );
    if (newToken) {
      // Retry with new token
      return deleteDropboxFile(
        filePath,
        newToken,
        sessionId,
        sessionRefreshToken,
      );
    }

    console.error(`[DROPBOX] Error deleting file ${filePath}:`, error?.message);
    throw new Error(
      `Failed to delete Dropbox file: ${error?.message || "Unknown error"}`,
    );
  }
}

/**
 * List all items in a Dropbox folder (for folder browser)
 * Automatically refreshes token if it expires (401 error)
 */
export async function listDropboxItems(
  folderPath: string,
  accessToken: string,
  sessionId?: string,
  sessionRefreshToken?: string | null,
  attempt = 1,
): Promise<
  Array<{
    id: string;
    name: string;
    type: "file" | "folder";
    size?: number;
    modifiedTime?: string;
  }>
> {
  const MAX_RETRIES = 6;
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
      type: "file" | "folder";
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
          type: entry[".tag"] === "folder" ? "folder" : "file",
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
      console.log(
        `[DROPBOX] Fetching more items... (current count: ${allItems.length})`,
      );
      response = await dbx.filesListFolderContinue({
        cursor: response.result.cursor,
      });
      if (response.result.entries) {
        processEntries(response.result.entries);
      }
    }

    console.log(`[DROPBOX] Total items fetched: ${allItems.length}`);
    return allItems;
  } catch (error: any) {
    const status =
      error?.status ?? error?.statusCode ?? error?.response?.status;
    const is429 = status === 429;
    const is503 = status === 503;
    if ((is429 || is503) && attempt <= MAX_RETRIES) {
      const retryAfterMs = dropboxRateLimitRetryDelayMs(error, attempt);
      console.warn(
        `[DROPBOX] ${is503 ? "503" : "429"} listing folder, retry ${attempt}/${MAX_RETRIES} in ${Math.round(retryAfterMs / 1000)}s`,
      );
      await sleep(retryAfterMs);
      return listDropboxItems(
        folderPath,
        accessToken,
        sessionId,
        sessionRefreshToken,
        attempt + 1,
      );
    }

    if (isTransientDropboxNetworkError(error) && attempt <= MAX_RETRIES) {
      const delay = Math.min(1500 * attempt, 20000);
      console.warn(
        `[DROPBOX] Transient network error listing folder (attempt ${attempt}/${MAX_RETRIES}), retry in ${delay}ms:`,
        error?.message || error,
      );
      await sleep(delay);
      return listDropboxItems(
        folderPath,
        accessToken,
        sessionId,
        sessionRefreshToken,
        attempt + 1,
      );
    }

    // Handle 401 errors (token refresh)
    const newToken = await handleDropbox401Error(
      error,
      accessToken,
      sessionId,
      sessionRefreshToken,
      "list items",
    );
    if (newToken) {
      // Retry with new token
      return listDropboxItems(
        folderPath,
        newToken,
        sessionId,
        sessionRefreshToken,
        1,
      );
    }

    // Log full error details for debugging
    console.error("[DROPBOX] Error listing items:", error?.message);
    console.error(
      "[DROPBOX] Error details:",
      JSON.stringify(
        {
          status: error?.status,
          error: error?.error,
          message: error?.message,
          headers: error?.headers,
        },
        null,
        2,
      ),
    );

    // Extract more specific error message from Dropbox API response
    let errorMessage = error?.message || "Unknown error";
    if (error?.error?.error_summary) {
      errorMessage = error.error.error_summary;
    } else if (error?.error?.error?.[".tag"]) {
      errorMessage = `${error.error.error[".tag"]}: ${JSON.stringify(error.error.error)}`;
    }

    throw new Error(`Failed to list Dropbox items: ${errorMessage}`);
  }
}
