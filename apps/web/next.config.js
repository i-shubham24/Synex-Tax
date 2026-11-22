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
    if (!rawApiUrl) {
      /* In standalone demo mode or on Vercel without a configured API backend,
         route API calls directly to internal App Router handlers */
      return [];
    }
    const apiUrl = rawApiUrl.replace(/\/+$/, '');
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
