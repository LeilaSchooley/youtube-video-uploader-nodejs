import { google } from "googleapis";

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
  try {
    // First, get the user's channel ID
    const channelResponse = await youtube.channels.list({
      part: ["id"],
      mine: true,
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      console.log("[YOUTUBE-UTILS] Could not get channel ID, skipping duplicate check");
      return false;
    }

    const channelId = channelResponse.data.items[0].id;
    if (!channelId) {
      return false;
    }

    // Search for videos with the exact title on the user's channel
    const searchResponse = await youtube.search.list({
      part: ["snippet"],
      q: title,
      channelId: channelId,
      type: ["video"],
      maxResults: 10,
    });

    if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
      return false;
    }

    // Check if any video has an exact title match (case-insensitive)
    const exactMatch = searchResponse.data.items.some(
      (item: any) =>
        item.snippet?.title?.toLowerCase().trim() === title.toLowerCase().trim()
    );

    if (exactMatch) {
      console.log(`[YOUTUBE-UTILS] Video with title "${title.substring(0, 50)}..." already exists on channel`);
      return true;
    }

    return false;
  } catch (error: any) {
    // If duplicate check fails, log but don't block upload
    console.warn(`[YOUTUBE-UTILS] Error checking for duplicate video: ${error?.message || error}`);
    return false;
  }
}

/**
 * Check multiple videos for duplicates in batch
 * @param youtube - YouTube API client
 * @param titles - Array of video titles to check
 * @returns Promise<Set<string>> - Set of titles that already exist
 */
export async function checkDuplicatesBatch(
  youtube: ReturnType<typeof google.youtube>,
  titles: string[]
): Promise<Set<string>> {
  const duplicates = new Set<string>();
  
  // Check each title
  for (const title of titles) {
    if (title && title.trim()) {
      const exists = await videoAlreadyExists(youtube, title.trim());
      if (exists) {
        duplicates.add(title.trim());
      }
    }
  }
  
  return duplicates;
}
