import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://synextax.in').replace(/\/$/, '');

const PUBLIC_ROUTES = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/products/gst', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/products/tds', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/products/sign', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/products/desk', priority: 0.85, changeFrequency: 'monthly' as const },
  { path: '/switch', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/security', priority: 0.75, changeFrequency: 'monthly' as const },
  { path: '/contact', priority: 0.75, changeFrequency: 'monthly' as const },
  { path: '/whats-new', priority: 0.7, changeFrequency: 'weekly' as const },
  { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.4, changeFrequency: 'yearly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path || '/'}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
