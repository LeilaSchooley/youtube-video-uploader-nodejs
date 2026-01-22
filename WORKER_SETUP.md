# Worker Setup Guide

## The Issue
Bulk uploads (from Google Sheets, Drive folders, etc.) require a **background worker** to process them. If the worker isn't running, jobs will stay in "pending" status and won't upload.

## Quick Start

### Option 1: Run Worker in Development (Terminal)
```bash
npm run worker
```

### Option 2: Run Worker with Auto-Restart (Development)
```bash
npm run worker:dev
```

### Option 3: Run with PM2 (Production)
```bash
# Start both Next.js and worker
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Stop
npm run pm2:stop
```

## How to Check if Worker is Running

1. **Check for pending jobs:**
   ```bash
   node -e "const fs = require('fs'); const data = JSON.parse(fs.readFileSync('data/bulk-queue.json', 'utf8')); console.log('Pending:', data.filter(j => j.status === 'pending').length);"
   ```

2. **Check worker logs:**
   - If using PM2: `npm run pm2:logs`
   - If running directly: Check terminal output for `[WORKER]` messages

3. **Look for these log messages:**
   - `[WORKER] Starting bulk upload worker...`
   - `[WORKER] Processing job...`
   - `[WORKER] Job completed successfully`

## What the Worker Does

- Checks for pending bulk upload jobs every 5 seconds
- Processes jobs in batches of 3 videos at a time
- Updates progress in real-time
- Handles Google Drive files, URLs, and scheduled uploads

## Troubleshooting

**Jobs stuck in "pending":**
- Worker is not running → Start the worker
- Check worker logs for errors
- Verify authentication tokens are valid

**Worker not processing:**
- Check if jobs exist: `data/bulk-queue.json`
- Verify worker has access to the data directory
- Check for authentication errors in logs
