# ZonDiscounts YouTube Video Uploader

A Next.js application for uploading videos to YouTube using Google OAuth.

## Migration from Express.js

This project has been migrated from Express.js + EJS to Next.js with React. The migration includes:

- ✅ Converted EJS templates to React components
- ✅ Migrated Express routes to Next.js API routes
- ✅ Implemented session management with cookies
- ✅ Maintained all existing functionality (OAuth, single upload, CSV batch upload)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env`:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

Or provide `src/creds.json` with the same structure as before.

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # OAuth routes
│   │   ├── upload/       # Video upload routes
│   │   └── user/         # User info route
│   ├── dashboard/       # Dashboard page
│   ├── privacy/          # Privacy policy page
│   ├── terms/           # Terms of service page
│   ├── layout.js        # Root layout
│   ├── page.js          # Home page
│   └── globals.css      # Global styles
├── lib/
│   ├── auth.js          # OAuth client setup
│   ├── session.js       # Session management
│   └── utils.js         # Utility functions
└── src/
    └── creds.json      # Google OAuth credentials (optional)
```

## Features

- **Google OAuth Authentication**: Secure login with Google account
- **Single Video Upload**: Upload individual videos with metadata
- **Batch CSV Upload**: Upload multiple videos from a CSV file
- **Scheduled Publishing**: Schedule videos to be published at specific times
- **Privacy Controls**: Set video privacy (public, private, unlisted)

## API Routes

- `GET /api/auth/url` - Get OAuth authorization URL
- `GET /api/auth/callback` - OAuth callback handler
- `GET /api/auth/logout` - Logout user
- `GET /api/user` - Get authenticated user info
- `POST /api/upload` - Upload a single video
- `POST /api/upload-csv` - Upload videos from CSV
- `POST /api/delete-account` - Delete account and revoke access

## Notes

- Session management uses in-memory storage (suitable for development)
- For production, consider using Redis or a database-backed session store
- The CSV upload feature expects file paths on the server filesystem
- Make sure your Google OAuth redirect URI matches your deployment URL

## License

ISC




