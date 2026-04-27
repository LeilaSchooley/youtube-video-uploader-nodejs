# Troubleshooting Comment Posting

If you're seeing `Insufficient Permission` errors when posting comments, this guide will help you fix it.

## The Problem

The error message: **"Insufficient Permission — re-login Google for comment scope (youtube.force-ssl)"** means your Google OAuth session doesn't have permission to post comments.

This usually happens when:
1. You authenticated **before** we added comment posting support
2. You deleted your account and re-authenticated, but Google's OAuth cached your old permission set
3. The `youtube.force-ssl` scope wasn't properly requested

## The Solution

### Step 1: Delete Your Account (Clear Old Permissions)

Go to the dashboard and click "Delete Account" in the settings. This clears your cached Google OAuth token.

### Step 2: Test Comment Button (Optional, But Recommended)

Before uploading videos:
1. Go to **Statistics** tab
2. Click the **"Test Comment"** button
3. Enter any YouTube video ID (e.g., `dQw4w9WgXcQ`)
4. Enter a test comment
5. Click "Test Post Comment"

**If it works:** You're all set for manifest uploads.  
**If it fails:** Continue to Step 3.

### Step 3: Force Full Re-Authentication

1. Click **"Logout"** at the top of the page
2. Click **"Login with Google"**
3. **Important:** On the Google OAuth consent screen, you should see multiple permission prompts
4. Make sure you see a prompt for **"YouTube"** permissions with the comment scope
5. Click **"Allow"** to grant all permissions

After re-authenticating, test the comment button again before uploading.

## How Comment Posting Works

When you upload a video via manifest (JSON file with `top_comment` or `pinned_comment` field):

1. **Detection:** Worker logs: `"Python manifest queue: comment detected, will attempt to post"`
2. **Posting:** If successful, logs: `"Python manifest queue: posted top-level comment"`
3. **Failure:** If OAuth scope is missing, logs: `"Python manifest queue: comment post failed"`

## Checking Worker Logs

To see what's happening during upload:

```bash
# If using PM2
npm run pm2:logs

# If running worker directly
npm run worker:dev
```

Look for lines like:
- `comment detected, will attempt to post` ✅ Comment is present
- `posted top-level comment` ✅ Successfully posted
- `comment post failed` ⚠️ Permission or API error
- `no comment field detected` ℹ️ No comment in manifest

## Required OAuth Scopes

The app requests these scopes:
- `youtube.upload` — Upload videos
- `youtube.force-ssl` — **Post comments** (requires HTTPS/SSL)
- `youtube.readonly` — Read channel & video info
- `userinfo.profile` — Your profile name & picture
- `userinfo.email` — Your email address

If you see a permission error, **one of these scopes wasn't granted**. Delete your account and re-authenticate.

## Manifest Format

To add a comment to a manifest upload, include one of:

```json
{
  "title": "My Video",
  "description": "...",
  "top_comment": "This is a pinned comment that goes at the top"
}
```

Or:

```json
{
  "title": "My Video",
  "description": "...",
  "pinned_comment": "This is an alternative comment field"
}
```

Both fields work; `top_comment` is checked first.

## Still Having Issues?

1. **Check the Status Column:** Go to Statistics → All uploaded videos → Comment column shows:
   - ✅ Posted — Successfully posted
   - ⚠️ Failed — See error details in tooltip
   - ⏭️ Skipped — No comment in manifest

2. **Test First:** Use the "Test Comment" button to verify permissions before uploading

3. **Look at Worker Logs:** The worker logs are the source of truth. They show exactly what happened

4. **Re-authenticate:** Delete account + logout + re-login is usually the fix

---

If you're still stuck, check the worker output for the exact error message and share it with debugging.
