/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  transpilePackages: ['@synextax/tax-engine', '@synextax/shared-schemas'],
  async redirects() {
    return [
      { source: '/invoices', destination: '/gst', permanent: false },
    ];
  },
  async rewrites() {
    const rawApiUrl = process.env.API_URL;
    const apiUrl = rawApiUrl ? rawApiUrl.replace(/\/+$/, '') : 'http://127.0.0.1:4000';
    return [
      {
        source: '/api/:path*',
        destination: apiUrl.endsWith('/api') ? `${apiUrl}/:path*` : `${apiUrl}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' http://localhost:4000 http://127.0.0.1:4000 http://localhost:18531 http://127.0.0.1:18531 https://127.0.0.1:18531 ws://localhost:3000 ws://127.0.0.1:3000",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
