'use client';

import { useEffect, useState, MouseEvent } from 'react';
import Link from 'next/link';

interface AuthUrlResponse {
  url: string;
}

export default function Home() {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/auth/url')
      .then(res => res.json())
      .then((data: AuthUrlResponse) => {
        setAuthUrl(data.url);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching auth URL:', err);
        setLoading(false);
      });
  }, []);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!authUrl) {
      e.preventDefault();
      return;
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-50 via-red-50/30 to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="text-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-10 sm:p-12 shadow-2xl max-w-md w-[90%] border border-gray-100 dark:border-gray-700 animate-fade-in relative z-10">
        {/* YouTube icon with animation */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl animate-pulse-slow"></div>
            <svg
              className="w-32 h-32 mx-auto relative z-10 transform hover:scale-110 transition-transform duration-300"
              width="120"
              height="120"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              focusable="false"
            >
              <rect width="24" height="24" rx="5" fill="url(#gradient)" className="drop-shadow-lg"></rect>
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#FF0000" />
                  <stop offset="100%" stopColor="#CC0000" />
                </linearGradient>
              </defs>
              <path d="M8 9.5L15 12L8 14.5V9.5Z" fill="white"></path>
            </svg>
          </div>
        </div>
        
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent">
          ZonDiscounts Uploader
        </h1>
        <p className="mb-10 text-lg leading-relaxed text-gray-600 dark:text-gray-300">
          Connect with your Google account to start uploading your videos to
          YouTube. It&apos;s <span className="font-semibold text-red-600 dark:text-red-400">fast</span>, <span className="font-semibold text-red-600 dark:text-red-400">secure</span>, and <span className="font-semibold text-red-600 dark:text-red-400">simple</span>!
        </p>
        
        {loading ? (
          <div className="py-4 px-8 text-lg text-gray-600 dark:text-gray-400 flex items-center justify-center gap-3">
            <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-red-600"></div>
            Loading...
          </div>
        ) : (
          <a
            href={authUrl}
            onClick={handleClick}
            className="btn-primary inline-flex items-center justify-center gap-3 text-lg px-8 py-4 group"
          >
            <svg className="w-6 h-6 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="white"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
            </svg>
            Continue with Google
          </a>
        )}
        
        <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          &copy; 2025 ZonDiscounts. All rights reserved. &nbsp;|&nbsp;
          <Link href="/privacy" className="text-red-600 dark:text-red-400 hover:underline font-medium">Privacy</Link> &nbsp;|&nbsp; 
          <Link href="/terms" className="text-red-600 dark:text-red-400 hover:underline font-medium">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
