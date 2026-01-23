/**
 * HTTP-based Google Drive folder scraper
 * Fetches folder contents directly from Drive HTML without using the API
 */

interface ScrapedFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
  folderPath?: string;
}

/**
 * Extract folder ID from Drive URL
 */
export function extractFolderIdFromUrl(url: string): string | null {
  // Handle various Drive URL formats
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{25,})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Check if input is a Drive URL (vs just a folder ID)
 */
export function isDriveUrl(input: string): boolean {
  return input.includes('drive.google.com') || input.includes('http://') || input.includes('https://');
}

/**
 * Parse a single HTML page and extract file information
 */
async function parseDrivePageHtml(html: string, folderId: string): Promise<{
  files: ScrapedFile[];
  continuationToken?: string;
}> {
  const files: ScrapedFile[] = [];
  
  // Method 3: Parse HTML table structure directly (most reliable for Drive folder pages)
  const tableRowPattern = /<tr[\s\S]*?data-id="([a-zA-Z0-9_-]+)"[\s\S]*?>([\s\S]*?)<\/tr>/gi;
  const fileMetadataFromTable = new Map<string, { name: string; mimeType: string; size?: string; modifiedTime?: string }>();
  
  let rowMatch;
  let rowCount = 0;
  while ((rowMatch = tableRowPattern.exec(html)) !== null) {
    rowCount++;
    const fileId = rowMatch[1];
    const rowHtml = rowMatch[2];
    
    // Extract file name from multiple possible locations in the HTML
    let fileName: string | null = null;
    
    // Try aria-label with "Video" indicator (most reliable)
    const ariaLabelMatch = rowHtml.match(/aria-label="([^"]+?)\s+Video[^"]*"/i);
    if (ariaLabelMatch && ariaLabelMatch[1]) {
      fileName = ariaLabelMatch[1].trim();
    }
    
    // Try data-tooltip with "Video" indicator
    if (!fileName) {
      const tooltipMatch = rowHtml.match(/data-tooltip="([^"]+?)\s+Video[^"]*"/i);
      if (tooltipMatch && tooltipMatch[1]) {
        fileName = tooltipMatch[1].trim();
      }
    }
    
    // Try DNoYtb element (Drive's file name display element)
    if (!fileName) {
      const dnoYtbMatch = rowHtml.match(/<strong[^>]*class="[^"]*DNoYtb[^"]*"[^>]*>([^<]+)<\/strong>/i);
      if (dnoYtbMatch && dnoYtbMatch[1]) {
        fileName = dnoYtbMatch[1].trim();
      }
    }
    
    // Try any aria-label as last resort
    if (!fileName) {
      const anyAriaLabelMatch = rowHtml.match(/aria-label="([^"]+)"[^>]*data-handled-by-drag-and-drop/i);
      if (anyAriaLabelMatch && anyAriaLabelMatch[1]) {
        fileName = anyAriaLabelMatch[1].trim();
      }
    }
    
    if (fileName) {
      // Extract file size if available
      const sizeMatch = rowHtml.match(/(\d+\.?\d*)\s*(MB|KB|GB|B)/i);
      const fileSize = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : undefined;
      
      // Extract modified time if available
      const timeMatch = rowHtml.match(/aria-label="Modified\s+([^"]+)"/i);
      const modifiedTime = timeMatch ? timeMatch[1] : undefined;
      
      // Determine if it's a video
      const isVideo = /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|mpg|mpeg|3gp|ogv)$/i.test(fileName) ||
                     rowHtml.includes('Video') ||
                     rowHtml.includes('video/') ||
                     rowHtml.match(/mask-id="ucc-\d+"/);
      
      if (isVideo) {
        // Determine mimeType from extension
        let mimeType = 'video/mp4';
        if (/\.mp4$/i.test(fileName)) mimeType = 'video/mp4';
        else if (/\.avi$/i.test(fileName)) mimeType = 'video/x-msvideo';
        else if (/\.mov$/i.test(fileName)) mimeType = 'video/quicktime';
        else if (/\.mkv$/i.test(fileName)) mimeType = 'video/x-matroska';
        else if (/\.webm$/i.test(fileName)) mimeType = 'video/webm';
        else if (/\.flv$/i.test(fileName)) mimeType = 'video/x-flv';
        else if (/\.wmv$/i.test(fileName)) mimeType = 'video/x-ms-wmv';
        else if (/\.m4v$/i.test(fileName)) mimeType = 'video/x-m4v';
        else if (/\.(mpg|mpeg)$/i.test(fileName)) mimeType = 'video/mpeg';
        
        fileMetadataFromTable.set(fileId, {
          name: fileName,
          mimeType,
          size: fileSize,
          modifiedTime,
        });
      }
    }
  }
  
  console.log(`[DRIVE-SCRAPER] Processed ${rowCount} table rows, found ${fileMetadataFromTable.size} video files`);
  
  // Add files from table parsing
  for (const [fileId, metadata] of Array.from(fileMetadataFromTable.entries())) {
    files.push({
      id: fileId,
      name: metadata.name,
      mimeType: metadata.mimeType,
      size: metadata.size,
      modifiedTime: metadata.modifiedTime,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
    });
  }
  
  // Try to extract continuation token from HTML/JavaScript
  // Look for continuation tokens in various formats
  let continuationToken: string | undefined;
  
  // Pattern 1: Look for continuation tokens in script tags (Drive API responses)
  // Drive uses "~!!~" prefix for continuation tokens
  const continuationPatterns = [
    /"~!!~([A-Za-z0-9_=-]+)"/, // Drive's continuation token format (most common)
    /"continuation_token"\s*:\s*"([^"]+)"/i,
    /continuationToken["']\s*:\s*["']([^"']+)["']/i,
    /continuation["']\s*:\s*["']([^"']+)["']/i,
    /\[null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*null,\s*"([^"]+)"/, // Array format
  ];
  
  // Search in script tags specifically (where Drive embeds data)
  const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const scriptTag of scriptTags) {
    for (const pattern of continuationPatterns) {
      const match = scriptTag.match(pattern);
      if (match && match[1] && match[1].length > 20 && !match[1].includes('</')) {
        continuationToken = match[1];
        console.log(`[DRIVE-SCRAPER] Found continuation token in script tag (length: ${continuationToken.length})`);
        break;
      }
    }
    if (continuationToken) break;
  }
  
  // Also search the entire HTML as fallback
  if (!continuationToken) {
    for (const pattern of continuationPatterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 20 && !match[1].includes('</')) {
        continuationToken = match[1];
        console.log(`[DRIVE-SCRAPER] Found continuation token in HTML (length: ${continuationToken.length})`);
        break;
      }
    }
  }
  
  if (!continuationToken) {
    console.log(`[DRIVE-SCRAPER] No continuation token found - this may be the last page or pagination not available`);
  }
  
  return { files, continuationToken };
}

/**
 * Scrape Google Drive folder HTML to extract file information
 * Handles pagination to get all files
 */
export async function scrapeDriveFolder(
  folderUrlOrId: string,
  recursive: boolean = false
): Promise<{
  folderName: string;
  files: ScrapedFile[];
}> {
  console.log(`[DRIVE-SCRAPER] Starting scrape for: ${folderUrlOrId}, recursive: ${recursive}`);

  // Extract folder ID from URL if needed
  let folderId: string;
  let folderUrl: string;

  if (isDriveUrl(folderUrlOrId)) {
    folderId = extractFolderIdFromUrl(folderUrlOrId) || folderUrlOrId;
    folderUrl = folderUrlOrId.includes('http') ? folderUrlOrId : `https://drive.google.com/drive/folders/${folderId}`;
  } else {
    folderId = folderUrlOrId;
    folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
  }

  console.log(`[DRIVE-SCRAPER] Folder ID: ${folderId}, URL: ${folderUrl}`);

  const allFiles: ScrapedFile[] = [];
  let pageNumber = 1;
  let continuationToken: string | undefined;
  const maxPages = 100; // Safety limit to prevent infinite loops
  let folderName = "Unknown Folder";

  // Fetch and parse pages until no more continuation token
  do {
    console.log(`[DRIVE-SCRAPER] Fetching page ${pageNumber}...`);
    
    // Build URL with pagination if we have a continuation token
    let currentUrl = folderUrl;
    if (continuationToken && pageNumber > 1) {
      // Try to append continuation token as query parameter
      currentUrl = `${folderUrl}?continuation=${encodeURIComponent(continuationToken)}`;
    }

    // Fetch the folder page HTML
    const response = await fetch(currentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Drive folder page ${pageNumber}: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`[DRIVE-SCRAPER] Fetched page ${pageNumber} HTML, length: ${html.length}`);

    // Extract folder name from first page only
    if (pageNumber === 1) {
      const folderNameMatch = html.match(/<title>([^<]+)<\/title>/i) || 
                              html.match(/"name":"([^"]+)"/i) ||
                              html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
      if (folderNameMatch && folderNameMatch[1]) {
        folderName = folderNameMatch[1].replace(/ - Google Drive$/, '').trim();
      }
    }

    // Parse this page
    const { files, continuationToken: nextToken } = await parseDrivePageHtml(html, folderId);
    allFiles.push(...files);
    
    console.log(`[DRIVE-SCRAPER] Page ${pageNumber}: Found ${files.length} files (total so far: ${allFiles.length})`);
    
    // Check if we should continue paginating
    continuationToken = nextToken;
    
    if (continuationToken && pageNumber < maxPages) {
      pageNumber++;
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      if (pageNumber >= maxPages) {
        console.warn(`[DRIVE-SCRAPER] Reached max pages limit (${maxPages}), stopping pagination`);
      }
      continuationToken = undefined; // Stop pagination
    }
  } while (continuationToken);

  console.log(`[DRIVE-SCRAPER] Completed pagination: ${pageNumber} page(s), ${allFiles.length} total files`);

  // Handle recursive folder scanning if requested
  if (recursive && allFiles.length > 0) {
    console.log(`[DRIVE-SCRAPER] Recursive mode: scanning subfolders`);
    // Note: Recursive scanning would require fetching the first page again to extract subfolder IDs
    // For now, pagination focuses on getting all files from the current folder
    // Recursive subfolder scanning can be enhanced later if needed
  }

  console.log(`[DRIVE-SCRAPER] Scraped ${allFiles.length} video files from folder "${folderName}"`);

  return {
    folderName,
    files: allFiles,
  };
}

/**
 * Scrape Drive folder and return videos only (matching API format)
 */
export async function scrapeDriveVideos(
  folderUrlOrId: string,
  recursive: boolean = false
): Promise<ScrapedFile[]> {
  const { files } = await scrapeDriveFolder(folderUrlOrId, recursive);
  return files;
}
