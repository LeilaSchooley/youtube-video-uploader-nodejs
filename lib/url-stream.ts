import { Readable } from "stream";
import https from "https";
import http from "http";
import { URL } from "url";

export interface StreamOptions {
  timeout?: number; // Timeout in milliseconds (default: 5 minutes)
  headers?: Record<string, string>; // Custom headers (e.g., Authorization)
  maxRedirects?: number; // Maximum number of redirects to follow (default: 5)
}

/**
 * Fetch a file from an external URL as a stream with timeout and authentication support
 * @param url - The URL to fetch from
 * @param options - Stream options (timeout, headers, maxRedirects)
 * @returns Promise<Readable> - A readable stream of the file
 */
export function fetchFileAsStream(
  url: string,
  options: StreamOptions = {}
): Promise<Readable> {
  const {
    timeout = 5 * 60 * 1000, // 5 minutes default
    headers = {},
    maxRedirects = 5,
  } = options;

  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    let timeoutId: NodeJS.Timeout | null = null;

    const fetch = (targetUrl: string): void => {
      try {
        const parsedUrl = new URL(targetUrl);
        const client = parsedUrl.protocol === "https:" ? https : http;

        const requestOptions: https.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: "GET",
          headers: {
            "User-Agent": "YouTube-Video-Uploader/1.0",
            ...headers,
          },
        };

        const req = client.get(requestOptions, (response) => {
          // Clear timeout on response
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // Handle redirects
          if (
            (response.statusCode === 301 ||
              response.statusCode === 302 ||
              response.statusCode === 307 ||
              response.statusCode === 308) &&
            response.headers.location
          ) {
            if (redirectCount >= maxRedirects) {
              reject(
                new Error(
                  `Too many redirects (max: ${maxRedirects}). Last URL: ${targetUrl}`
                )
              );
              return;
            }

            redirectCount++;
            const redirectUrl = response.headers.location;
            const absoluteUrl = new URL(redirectUrl, targetUrl).href;
            fetch(absoluteUrl);
            return;
          }

          // Handle errors
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              new Error(
                `Failed to fetch file: ${response.statusCode} ${response.statusMessage || "Unknown error"}`
              )
            );
            return;
          }

          // Success - return the stream
          resolve(Readable.from(response));
        });

        req.on("error", (error) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          reject(error);
        });

        // Set timeout
        timeoutId = setTimeout(() => {
          req.destroy();
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
      } catch (error: any) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        reject(new Error(`Invalid URL: ${error.message}`));
      }
    };

    fetch(url);
  });
}

/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extract filename from URL (for display purposes)
 */
export function getFilenameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const filename = pathname.split("/").pop() || "video";
    return filename;
  } catch {
    return "video";
  }
}

