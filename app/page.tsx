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
    // Generate auth URL on client side
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
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--background-color)',
    }}>
      <div style={{
        textAlign: 'center',
        background: 'var(--card-background)',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 8px 24px var(--shadow-color)',
        maxWidth: '480px',
        width: '90%',
      }}>
        <svg
          style={{ width: '120px', marginBottom: '24px' }}
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
        <h1 style={{
          fontSize: '2.5rem',
          marginBottom: '20px',
          color: 'var(--secondary-color)',
        }}>ZonDiscounts Video Uploader</h1>
        <p style={{
          marginBottom: '30px',
          fontSize: '1.1rem',
          lineHeight: '1.6',
          color: '#666',
        }}>
          Connect with your Google account to start uploading your videos to
          YouTube. It&apos;s fast, secure, and simple!
        </p>
        {loading ? (
          <div style={{
            padding: '14px 28px',
            fontSize: '1.1rem',
            color: '#666',
          }}>Loading...</div>
        ) : (
          <a
            href={authUrl}
            onClick={handleClick}
            style={{
              background: 'var(--primary-color)',
              color: 'white',
              textDecoration: 'none',
              padding: '14px 28px',
              fontSize: '1.1rem',
              fontWeight: '500',
              borderRadius: '30px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'background-color 0.3s, transform 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e60000';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary-color)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <i className="fab fa-google"></i> Continue with Google
          </a>
        )}
        <footer style={{
          marginTop: '40px',
          fontSize: '0.9rem',
          color: '#999',
        }}>
          &copy; 2025 ZonDiscounts. All rights reserved. &nbsp;|&nbsp;
          <Link href="/privacy">Privacy</Link> &nbsp;|&nbsp; <Link href="/terms">Terms</Link>
        </footer>
      </div>
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/js/all.min.js"></script>
    </div>
  );
}

