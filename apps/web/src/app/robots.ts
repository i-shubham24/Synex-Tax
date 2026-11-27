import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://synextax.in').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/pricing',
          '/switch',
          '/products/',
          '/features/',
          '/security',
          '/privacy',
          '/terms',
          '/contact',
          '/whats-new',
        ],
        disallow: [
          '/api/',
          '/admin',
          '/login',
          '/signup',
          '/forgot-password',
          '/invite',
          '/dashboard',
          '/clients',
          '/gst',
          '/tds',
          '/itr',
          '/tax-audit',
          '/practice',
          '/documents',
          '/bank',
          '/audit',
          '/settings',
          '/messages',
          '/assistant',
          '/client',
          '/billing',
          '/dsc',
          '/upload',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
