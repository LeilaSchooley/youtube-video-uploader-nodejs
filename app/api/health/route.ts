import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Check disk space (basic check)
    let diskSpace: { free?: number; total?: number } = {};
    try {
      const stats = fs.statSync(dataDir);
      // Note: fs.statSync doesn't give disk space, but we can check if directories exist
    } catch (e) {
      // Directory might not exist yet
    }
    
    // Check critical files
    const queueFile = path.join(dataDir, 'queue.json');
    const sessionsFile = path.join(dataDir, 'sessions.json');
    
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      disk: {
        queue: fs.existsSync(queueFile),
        sessions: fs.existsSync(sessionsFile),
        uploads: fs.existsSync(uploadsDir),
        logs: fs.existsSync(logsDir),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
      },
    };
    
    return NextResponse.json(checks, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error?.message || 'Health check failed',
      },
      { status: 500 }
    );
  }
}





