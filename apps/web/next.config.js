/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  productionBrowserSourceMaps: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  transpilePackages: ['@synextax/tax-engine', '@synextax/shared-schemas'],
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.synextax.in' }],
        destination: 'https://synextax.in/:path*',
        statusCode: 301,
      },
      { source: '/invoices', destination: '/gst', permanent: false },
      { source: '/tools', destination: '/', statusCode: 301 },
      { source: '/home', destination: '/', statusCode: 301 },
      { source: '/index.html', destination: '/', statusCode: 301 },
      { source: '/features/gst', destination: '/products/gst', statusCode: 301 },
      { source: '/features/tds', destination: '/products/tds', statusCode: 301 },
      { source: '/product', destination: '/products/gst', statusCode: 301 },
      { source: '/product/:slug', destination: '/products/:slug', statusCode: 301 },
      { source: '/plans', destination: '/pricing', statusCode: 301 },
      { source: '/changelog', destination: '/whats-new', statusCode: 301 },
      { source: '/releases', destination: '/whats-new', statusCode: 301 },
      { source: '/demo', destination: '/contact', statusCode: 301 },
      { source: '/support', destination: '/contact', statusCode: 301 },
      { source: '/privacy-policy', destination: '/privacy', statusCode: 301 },
      { source: '/tos', destination: '/terms', statusCode: 301 },
      { source: '/terms-of-service', destination: '/terms', statusCode: 301 },
    ];
  },
  async rewrites() {
    /* Route all API calls to App Router handler with auto-fallback when backend is offline */
    return [];
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
