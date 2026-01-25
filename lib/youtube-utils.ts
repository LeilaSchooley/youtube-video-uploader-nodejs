import { google } from "googleapis";

// Environment variable to disable duplicate checking
const DISABLE_DUPLICATE_CHECK = process.env.DISABLE_DUPLICATE_CHECK === 'true' || 
                                 process.env.DISABLE_DUPLICATE_CHECK === '1';

// Cache for channel ID and existing video titles
let channelIdCache: string | null = null;
let existingTitlesCache: Set<string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Get the user's channel ID (cached)
 * @param youtube - YouTube API client
 * @returns Promise<string | null> - Channel ID or null if not found
 */
async function getChannelId(
  youtube: ReturnType<typeof google.youtube>
): Promise<string | null> {
  if (channelIdCache) {
    return channelIdCache;
  }

  try {
    const channelResponse = await youtube.channels.list({
      part: ["id"],
      mine: true,
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log("[YOUTUBE-UTILS] Could not get channel ID");
      return null;
    }

    const channelId = channelResponse.data.items[0].id;
    if (channelId) {
      channelIdCache = channelId;
      return channelId;
    }

    return null;
  } catch (error: any) {
    console.warn(`[YOUTUBE-UTILS] Error getting channel ID: ${error?.message || error}`);
    return null;
  }
}

/**
 * Fetch all video titles from the user's channel (with pagination)
 * @param youtube - YouTube API client
 * @param channelId - Channel ID
 * @returns Promise<Set<string>> - Set of all existing video titles (normalized to lowercase)
 */
async function fetchAllChannelVideoTitles(
  youtube: ReturnType<typeof google.youtube>,
  channelId: string
): Promise<Set<string>> {
  const titles = new Set<string>();
  let nextPageToken: string | undefined = undefined;
  let pageCount = 0;
  let totalVideos = 0;

  try {
    let response;
    do {
      pageCount++;
      response = await youtube.search.list({
        part: ["snippet"],
        channelId: channelId,
        type: ["video"],
        maxResults: 50, // Maximum allowed by YouTube API
        order: "date",
        pageToken: nextPageToken,
      });

      if (response.data.items) {
        for (const item of response.data.items) {
          const title = item.snippet?.title;
          if (title) {
            // Normalize title: lowercase and trim for comparison
            titles.add(title.toLowerCase().trim());
            totalVideos++;
          }
        }
      }

      nextPageToken = response.data.nextPageToken || undefined;
    } while (nextPageToken);

    console.log(`[YOUTUBE-UTILS] Fetched ${totalVideos} existing videos from channel (${pageCount} API requests)`);
    return titles;
  } catch (error: any) {
    console.warn(`[YOUTUBE-UTILS] Error fetching channel videos: ${error?.message || error}`);
    return titles; // Return whatever we got so far
  }
}

/**
 * Check if a video with the given title already exists on the user's YouTube channel
 * @param youtube - YouTube API client
 * @param title - Video title to search for
 * @returns Promise<boolean> - true if video exists, false otherwise
 */
export async function videoAlreadyExists(
  youtube: ReturnType<typeof google.youtube>,
  title: string
): Promise<boolean> {
  // Check if duplicate checking is disabled via environment variable
  if (DISABLE_DUPLICATE_CHECK) {
    return false; // Return false (no duplicate found) if disabled
  }
  
  try {
    const channelId = await getChannelId(youtube);
    if (!channelId) {
      return false;
    }

    // Use optimized batch check
    const duplicates = await checkDuplicatesBatch(youtube, [title]);
    return duplicates.has(title.toLowerCase().trim());
  } catch (error: any) {
    // If duplicate check fails, log but don't block upload
    console.warn(`[YOUTUBE-UTILS] Error checking for duplicate video: ${error?.message || error}`);
    return false;
  }
}

/**
 * Check multiple videos for duplicates in batch (OPTIMIZED)
 * Fetches all channel videos once, then compares in memory
 * @param youtube - YouTube API client
 * @param titles - Array of video titles to check
 * @returns Promise<Set<string>> - Set of titles that already exist
 */
export async function checkDuplicatesBatch(
  youtube: ReturnType<typeof google.youtube>,
  titles: string[]
): Promise<Set<string>> {
  const duplicates = new Set<string>();
  
  // Check if duplicate checking is disabled via environment variable
  if (DISABLE_DUPLICATE_CHECK) {
    console.log(`[YOUTUBE-UTILS] Duplicate check is disabled via DISABLE_DUPLICATE_CHECK environment variable`);
    return duplicates; // Return empty set (no duplicates found)
  }
  
  try {
    // Get channel ID (cached)
    const channelId = await getChannelId(youtube);
    if (!channelId) {
      console.log("[YOUTUBE-UTILS] Could not get channel ID, skipping duplicate check");
      return duplicates;
    }

    // Check if cache is still valid (5 minutes)
    const now = Date.now();
    if (existingTitlesCache && (now - cacheTimestamp) < CACHE_TTL) {
      console.log(`[YOUTUBE-UTILS] Using cached channel videos (${existingTitlesCache.size} videos)`);
    } else {
      // Fetch all videos from channel
      console.log(`[YOUTUBE-UTILS] Fetching all videos from channel for duplicate check...`);
      existingTitlesCache = await fetchAllChannelVideoTitles(youtube, channelId);
      cacheTimestamp = now;
    }

    // Compare input titles against existing titles (in-memory, no API calls)
    for (const title of titles) {
      if (title && title.trim()) {
        const normalizedTitle = title.toLowerCase().trim();
        if (existingTitlesCache.has(normalizedTitle)) {
          duplicates.add(title.trim()); // Keep original casing for reporting
        }
      }
    }

    if (duplicates.size > 0) {
      console.log(`[YOUTUBE-UTILS] Found ${duplicates.size} duplicate(s) out of ${titles.length} checked`);
    } else {
      console.log(`[YOUTUBE-UTILS] No duplicates found among ${titles.length} videos`);
    }

    return duplicates;
  } catch (error: any) {
    // If duplicate check fails, log but don't block upload
    console.warn(`[YOUTUBE-UTILS] Error checking for duplicates: ${error?.message || error}`);
    return duplicates; // Return empty set so upload continues
  }
}

/**
 * Clear the cache (useful for testing or if channel videos change)
 */
export function clearDuplicateCheckCache(): void {
  channelIdCache = null;
  existingTitlesCache = null;
  cacheTimestamp = 0;
  console.log("[YOUTUBE-UTILS] Cleared duplicate check cache");
}
