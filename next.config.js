/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // Suppress Next.js 15 async params warnings (we don't use params in pages)
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Experimental features
  experimental: {
    // Suppress warnings about async params when not using them
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // Suppress React DevTools serialization warnings for params
    optimizePackageImports: ['react', 'react-dom'],
  },
  // Webpack configuration for server-side packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize server-only packages to avoid bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'xlsx': 'commonjs xlsx',
        'dropbox': 'commonjs dropbox',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
