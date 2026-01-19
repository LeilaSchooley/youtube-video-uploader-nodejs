# 🌐 URL-Based Video Upload Guide

## Overview

Your YouTube uploader now supports **streaming directly from external URLs** to YouTube. This means:

- ✅ **No disk space usage** - Videos stream directly from external server → YouTube
- ✅ **No file uploads** - Skip uploading files to your server
- ✅ **Faster processing** - Direct server-to-server streaming
- ✅ **Scalable** - Handle thousands of videos without storage limits
- ✅ **Works with existing CSV format** - Just replace file paths with URLs

---

## How It Works

```
External Server (CDN/Storage) 
    ↓
    Stream (via HTTP/HTTPS)
    ↓
Your Linux Server (Worker)
    ↓
    Stream (direct pipe)
    ↓
YouTube API
```

**Your server never stores the video files** - it just orchestrates the streaming.

---

## CSV Format Options

### Option 1: Use `video_url` Column (Recommended)

```csv
youtube_title,youtube_description,video_url,thumbnail_url,privacyStatus
My Video 1,Description here,https://cdn.example.com/videos/video1.mp4,https://cdn.example.com/thumbs/thumb1.jpg,public
My Video 2,Description here,https://cdn.example.com/videos/video2.mp4,https://cdn.example.com/thumbs/thumb2.jpg,public
```

### Option 2: Use `path` Column with URLs (Auto-Detected)

The system automatically detects if `path` contains a URL:

```csv
youtube_title,youtube_description,path,thumbnail_path,privacyStatus
My Video 1,Description here,https://cdn.example.com/videos/video1.mp4,https://cdn.example.com/thumbs/thumb1.jpg,public
My Video 2,Description here,https://cdn.example.com/videos/video2.mp4,https://cdn.example.com/thumbs/thumb2.jpg,public
```

**Works with your existing CSV format!** Just replace file paths with URLs.

### Option 3: Mixed (URLs + Local Files)

You can mix URLs and local file paths in the same CSV:

```csv
youtube_title,youtube_description,path,privacyStatus
Video from URL,Description,https://cdn.example.com/video1.mp4,public
Video from Server,Description,/uploads/user123/video2.mp4,public
```

---

## Authentication Headers

If your external server requires authentication, use the `url_auth_headers` column:

```csv
youtube_title,youtube_description,video_url,url_auth_headers,privacyStatus
My Video,Description,https://secure.example.com/video.mp4,"{""Authorization"":""Bearer token123""}",public
```

**Important:** The headers must be valid JSON, with double quotes escaped.

### Common Auth Patterns

**Bearer Token:**
```json
{"Authorization":"Bearer your-token-here"}
```

**API Key:**
```json
{"X-API-Key":"your-api-key"}
```

**Basic Auth:**
```json
{"Authorization":"Basic base64-encoded-credentials"}
```

**Custom Headers:**
```json
{"X-Custom-Header":"value","Authorization":"Bearer token"}
```

---

## Timeout Configuration

For large videos or slow connections, set a custom timeout:

```csv
youtube_title,youtube_description,video_url,url_timeout,privacyStatus
Large Video,Description,https://cdn.example.com/large-video.mp4,1800000,public
```

- `url_timeout` is in **milliseconds**
- Default: 10 minutes (600,000 ms)
- Recommended for large files: 30 minutes (1,800,000 ms)

---

## Complete CSV Example

```csv
youtube_title,youtube_description,video_url,thumbnail_url,url_auth_headers,url_timeout,privacyStatus,scheduleTime
Affiliate Video 1,Great product review,https://cdn.example.com/videos/video1.mp4,https://cdn.example.com/thumbs/thumb1.jpg,"{""Authorization"":""Bearer token""}",600000,public,2024-01-15T10:00:00Z
Affiliate Video 2,Another review,https://cdn.example.com/videos/video2.mp4,https://cdn.example.com/thumbs/thumb2.jpg,"{""Authorization"":""Bearer token""}",600000,public,2024-01-16T10:00:00Z
```

---

## Using the Worker (Background Processing)

### For Bulk Uploads

When using `/api/upload-bulk`, files are automatically queued for background processing:

```javascript
const formData = new FormData();
formData.append('urls', 'https://cdn.example.com/video1.mp4');
formData.append('urls', 'https://cdn.example.com/video2.mp4');
formData.append('urlAuthHeaders', JSON.stringify({
  'Authorization': 'Bearer token123'
}));
formData.append('useWorker', 'true'); // Default: true

const response = await fetch('/api/upload-bulk', {
  method: 'POST',
  body: formData
});

const { jobId } = await response.json();
// Job is queued - check status with /api/bulk-status?jobId=xxx
```

### Check Job Status

```javascript
const statusResponse = await fetch(`/api/bulk-status?jobId=${jobId}`);
const status = await statusResponse.json();

console.log(status.status); // "pending" | "processing" | "completed" | "failed"
console.log(status.progress); // Array of progress items
```

---

## Running the Worker

### Development

```bash
npm run worker
```

### Production (PM2)

```bash
# Start both Next.js and worker
npm run pm2:start

# Or start separately
pm2 start npm --name "nextjs" -- start
pm2 start npm --name "bulk-upload-worker" -- run worker
```

The worker:
- Checks for new jobs every 5 seconds
- Processes videos in batches (3 at a time)
- Handles retries and errors automatically
- Logs progress to `logs/worker-out.log`

---

## Benefits for Your Use Case

### 1. **No Disk Space Issues**
Your Hetzner box stays lean. Videos never touch your disk.

### 2. **No Browser Uploads**
Skip the browser entirely. Server-to-server is stable and fast.

### 3. **Perfect for 1,000+ Videos**
Your CSV can reference 1,000 URLs. The worker processes them 24/7.

### 4. **Works with Your Existing CSV**
Just replace:
```
C:\Users\Me\Videos\clip1.mp4
```

With:
```
https://cdn.example.com/videos/clip1.mp4
```

### 5. **Scalable**
- Add more external servers? ✅
- Add more workers? ✅
- Process multiple channels? ✅

---

## Migration from File Paths to URLs

### Step 1: Upload Videos to External Server

Move your videos to:
- CDN (Cloudflare, CloudFront, etc.)
- Object Storage (S3, Backblaze, etc.)
- Your own server with public URLs

### Step 2: Update CSV

Replace file paths with URLs:

**Before:**
```csv
path
C:\Users\Me\Videos\video1.mp4
/var/www/uploads/video2.mp4
```

**After:**
```csv
path
https://cdn.example.com/videos/video1.mp4
https://cdn.example.com/videos/video2.mp4
```

Or use the `video_url` column:
```csv
video_url
https://cdn.example.com/videos/video1.mp4
https://cdn.example.com/videos/video2.mp4
```

### Step 3: Upload CSV

Use `/api/upload-csv` or `/api/upload-queue` - the system automatically detects URLs and streams them.

---

## Troubleshooting

### "Video file or URL not found"

- Check that the URL is accessible (try in browser)
- Verify URL format (must start with `http://` or `https://`)
- Check authentication headers if required

### "Request timeout"

- Increase `url_timeout` in CSV (in milliseconds)
- Check external server connection speed
- For very large files, set timeout to 30+ minutes

### "Failed to fetch file: 401/403"

- Add authentication headers in `url_auth_headers` column
- Verify your auth token is valid
- Check external server permissions

### Worker Not Processing

- Check worker is running: `pm2 status`
- Check logs: `pm2 logs bulk-upload-worker`
- Verify queue has pending jobs: Check `/api/bulk-status`

---

## Performance Tips

1. **Use CDN URLs** - Faster than direct server links
2. **Batch Processing** - Worker processes 3 videos at a time
3. **Timeout Settings** - Set appropriate timeouts for file sizes
4. **Monitor Progress** - Use `/api/bulk-status` to track jobs
5. **Error Handling** - Failed videos are logged with error messages

---

## Example: 1,000 Affiliate Videos

```csv
youtube_title,youtube_description,video_url,privacyStatus
Video 1,Description,https://cdn.example.com/videos/1.mp4,public
Video 2,Description,https://cdn.example.com/videos/2.mp4,public
... (998 more rows)
Video 1000,Description,https://cdn.example.com/videos/1000.mp4,public
```

1. Upload CSV via `/api/upload-queue`
2. Worker processes videos in background
3. Check status: `/api/bulk-status`
4. Videos upload 24/7 without your PC or browser

**Your server orchestrates. External servers store. YouTube receives.**

---

## Support

For issues or questions:
- Check worker logs: `pm2 logs bulk-upload-worker`
- Check API logs: `pm2 logs nextjs`
- Verify URLs are accessible
- Check authentication if required

