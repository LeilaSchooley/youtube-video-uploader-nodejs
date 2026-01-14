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
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <div className="text-center bg-white rounded-xl p-10 shadow-lg max-w-md w-[90%]">
        <svg
          className="w-32 mb-6 mx-auto"
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          <rect width="24" height="24" rx="4" fill="#F3F4F6"></rect>
          <path d="M8 9.5L15 12L8 14.5V9.5Z" fill="#FF6B6B"></path>
        </svg>
        <h1 className="text-4xl font-bold mb-5 text-gray-800">ZonDiscounts Video Uploader</h1>
        <p className="mb-8 text-lg leading-relaxed text-gray-600">
          Connect with your Google account to start uploading your videos to
          YouTube. It&apos;s fast, secure, and simple!
        </p>
        {loading ? (
          <div className="py-3.5 px-7 text-lg text-gray-600">Loading...</div>
        ) : (
          <a
            href={authUrl}
            onClick={handleClick}
            className="btn-primary inline-flex items-center justify-center gap-3 hover:scale-105 transition-transform"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>
        )}
        <footer className="mt-10 text-sm text-gray-500">
          &copy; 2025 ZonDiscounts. All rights reserved. &nbsp;|&nbsp;
          <Link href="/privacy" className="text-red-600 hover:underline">Privacy</Link> &nbsp;|&nbsp; <Link href="/terms" className="text-red-600 hover:underline">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
