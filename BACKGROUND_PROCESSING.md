# Background Processing System

This application now supports background processing for bulk video uploads. Files are uploaded to the server first, then processed by a background worker that uploads videos to YouTube.

## How It Works

1. **Upload Files**: User uploads CSV file with video metadata. The CSV references video files that should already exist on the server.

2. **Queue System**: Files are stored on the server and a job is added to the queue.

3. **Background Worker**: A worker process runs continuously, processing jobs from the queue:
   - Uploads videos to YouTube
   - Sets thumbnails
   - Schedules videos based on "videos per day" setting
   - Updates privacy status

4. **Status Tracking**: Users can check job status in the dashboard, which updates in real-time.

## File Structure

```
/uploads/
  └── {session-id}/
      └── {job-id}/
          ├── metadata.csv (updated with server paths)
          ├── videos/
          │   └── (video files)
          └── thumbnails/
              └── (thumbnail files)

/data/
  └── queue.json (queue state)
```

## CSV Format

The CSV file should have these columns:
- `youtube_title` (required): Video title
- `youtube_description` (required): Video description
- `video` (required): File path to video on server
- `thumbnail_path` (optional): File path to thumbnail on server
- `privacyStatus` (optional): "public", "private", or "unlisted" (defaults to "public")
- `scheduleTime` (optional): Publish date/time (for private videos)

## Running the Worker

### Development
```bash
npm run worker
```

### Production with PM2
```bash
# Start both Next.js app and worker
pm2 start ecosystem.config.js

# Or start separately
pm2 start npm --name "youtube-uploader" -- start
pm2 start npm --name "youtube-uploader-worker" -- run worker
```

### PM2 Commands
```bash
pm2 list                    # List all processes
pm2 logs youtube-uploader-worker  # View worker logs
pm2 restart youtube-uploader-worker  # Restart worker
pm2 stop youtube-uploader-worker    # Stop worker
```

## Scheduling

When "Enable Upload Scheduling" is checked:
- Videos are uploaded immediately to YouTube
- Videos are scheduled to publish on specific dates
- Distribution: If you set "5 videos per day" starting Jan 1:
  - Videos 1-5: Scheduled for Jan 1
  - Videos 6-10: Scheduled for Jan 2
  - And so on...

## Notes

- Videos scheduled for future dates are uploaded as "private" initially (YouTube requirement)
- The system attempts to update privacy status to your CSV's `privacyStatus` after upload
- If the update fails (common for scheduled videos), videos will publish as private and need manual update
- The worker processes all videos in a job at once, scheduling them with appropriate `publishAt` dates

