import type { Metadata } from 'next';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://synextax.in').replace(/\/$/, '');
export const BRAND_NAME = 'SynTax';
export const OPERATOR_NAME = 'Synex Labs';

export const MAX_TITLE_CHARS = 60;
export const MAX_TITLE_PX = 561;
export const MIN_DESC_CHARS = 130;
export const MAX_DESC_CHARS = 155;

/** Approximate glyph widths (px) in Google SERP desktop title typography (Arial 20px). */
const ARIAL_20PX_WIDTHS: Record<string, number> = {
  W: 18.9, M: 16.7, m: 16.7, w: 14.4, '@': 20.3, '%': 17.8, '&': 13.3,
  A: 13.3, B: 13.3, C: 14.4, D: 14.4, E: 13.3, F: 12.2, G: 15.6, H: 14.4,
  I: 5.6, J: 10.0, K: 13.3, L: 11.1, N: 14.4, O: 15.6, P: 13.3, Q: 15.6,
  R: 14.4, S: 13.3, T: 12.2, U: 14.4, V: 13.3, X: 13.3, Y: 13.3, Z: 12.2,
  a: 11.1, b: 11.1, c: 10.0, d: 11.1, e: 11.1, f: 5.6, g: 11.1, h: 11.1,
  i: 4.4, j: 4.4, k: 10.0, l: 4.4, n: 11.1, o: 11.1, p: 11.1, q: 11.1,
  r: 6.7, s: 10.0, t: 5.6, u: 11.1, v: 10.0, x: 10.0, y: 10.0, z: 10.0,
  ' ': 5.6, '|': 5.2, '-': 6.7, '+': 11.7, ',': 5.6, '.': 5.6, ':': 5.6,
  "'": 3.8, '’': 3.8, '/': 5.6, '₹': 11.1,
};

/** Measures estimated width in pixels using Arial 20px SERP metrics. */
export function measureSerpTitlePx(title: string): number {
  let width = 0;
  for (const ch of title) {
    if (ch in ARIAL_20PX_WIDTHS) {
      width += ARIAL_20PX_WIDTHS[ch];
    } else if (ch >= '0' && ch <= '9') {
      width += 11.1;
    } else {
      width += 11.1;
    }
  }
  return Math.round(width * 10) / 10;
}

/** Enforces 0% Google SERP truncation (<= 60 chars and <= 561px in Arial 20px). */
export function fitSerpTitle(rawTitle: string): string {
  const clean = rawTitle.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE_CHARS && measureSerpTitlePx(clean) <= MAX_TITLE_PX) {
    return clean;
  }
  const words = clean.split(' ');
  let fitted = '';
  for (const word of words) {
    const candidate = fitted ? `${fitted} ${word}` : word;
    if (candidate.length <= MAX_TITLE_CHARS && measureSerpTitlePx(candidate) <= MAX_TITLE_PX) {
      fitted = candidate;
    } else {
      break;
    }
  }
  return fitted || clean.slice(0, MAX_TITLE_CHARS);
}

const DEFAULT_PADDING_SLOTS = [
  'Built for Indian CA firms',
  'Hosted in AWS Mumbai',
  '14-day free trial',
];

/** Clamps and auto-pads meta descriptions strictly to [130, 155] characters without mid-word cuts. */
export function clampMetaDescription(rawDesc: string, extraSlots: string[] = []): string {
  let desc = rawDesc.replace(/\s+/g, ' ').trim();
  const slots = [...extraSlots, ...DEFAULT_PADDING_SLOTS];

  for (const slot of slots) {
    if (desc.length >= MIN_DESC_CHARS) break;
    const cleanSlot = slot.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    if (!cleanSlot) continue;
    const separator = desc.endsWith('.') ? ' ' : '. ';
    const candidate = `${desc}${separator}${cleanSlot}.`;
    if (candidate.length <= MAX_DESC_CHARS) {
      desc = candidate;
    }
  }

  if (desc.length <= MAX_DESC_CHARS) {
    return desc;
  }

  const slice = desc.slice(0, MAX_DESC_CHARS);
  const lastPeriod = slice.lastIndexOf('. ');
  if (lastPeriod >= MIN_DESC_CHARS - 1) {
    return slice.slice(0, lastPeriod + 1);
  }
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace >= MIN_DESC_CHARS) {
    return `${slice.slice(0, lastSpace).replace(/[.,;:\s]+$/, '')}.`;
  }
  return slice;
}

export interface PageSeoInput {
  path: string;
  title: string;
  description: string;
  paddingSlots?: string[];
  type?: 'website' | 'article';
  noIndex?: boolean;
}

/** Generates complete canonical, OpenGraph, Twitter, and robot metadata for a route. */
export function buildPageMetadata(input: PageSeoInput): Metadata {
  const normalizedPath = input.path === '/' ? '/' : `/${input.path.replace(/^\/+|\/+$/g, '')}`;
  const canonicalUrl = `${SITE_URL}${normalizedPath}`;
  const title = fitSerpTitle(input.title);
  const description = clampMetaDescription(input.description, input.paddingSlots);

  const robots: Metadata['robots'] = input.noIndex
    ? {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false },
      }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-snippet': -1,
          'max-image-preview': 'large',
          'max-video-preview': -1,
        },
      };

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots,
    openGraph: {
      type: input.type ?? 'website',
      siteName: BRAND_NAME,
      locale: 'en_IN',
      url: canonicalUrl,
      title,
      description,
      images: [
        {
          url: '/syntax-logo.png',
          width: 397,
          height: 232,
          alt: `${BRAND_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/syntax-logo.png'],
    },
  };
}

/** Reusable noindex metadata for auth, token portals, and authenticated workspace shells. */
export function buildPrivateMetadata(title: string, description: string, path: string): Metadata {
  return buildPageMetadata({
    path,
    title,
    description,
    noIndex: true,
  });
}

export const SEO_PAGES = {
  home: {
    path: '/',
    title: 'GST & TDS Software India | SynTax for CA Firms',
    description:
      'Prepare GSTR-1, GSTR-2B matching, IMS, dual-Act TDS Forms 138 to 144, FVU checks and USB DSC signing from one cloud workspace built for Indian CA firms.',
  },
  gst: {
    path: '/products/gst',
    title: 'SynTax GST | 2B Matching, IMS & 3B Filing India',
    description:
      'Import Tally or Busy purchase registers as exported, run sub-second GSTR-2B matching, act on IMS before the 14th and draft GSTR-3B with Rule 88A set-off.',
  },
  tds: {
    path: '/products/tds',
    title: 'SynTax TDS | Dual-Act Filing, FVU & CSI India',
    description:
      'Prepare 24Q, 26Q, 27Q and Forms 138 to 144 by date, match bank CSI challans, check files with Protean FVU on desktop and handle TRACES conso corrections.',
  },
  sign: {
    path: '/products/sign',
    title: 'SynTax Sign | Class 3 USB DSC Signing India',
    description:
      'Sign approved GST and TDS returns directly with your Class 3 USB DSC token without Java. Check signed Form 130 and 131 PDFs and back up Tally data locally.',
  },
  desk: {
    path: '/products/desk',
    title: 'SynTax Desk | CA Client Master & Audit Trail',
    description:
      'Keep every client PAN, GSTIN and TAN in one master record. Set partner, manager and staff access, collect papers via client links and log all changes.',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing | SynTax CA Plans From ₹4,999 India',
    description:
      'One annual firm price with zero per-PC fees. All four suites start at ₹8,999 a year, GST + Sign at ₹5,999 and TDS + Sign at ₹4,999, with a 14-day trial.',
  },
  switch: {
    path: '/switch',
    title: 'Switch to SynTax | Migrate Tally & SmartBiz',
    description:
      'Bring your CA client master from Excel, import historical 1961 and 2025 TDS files and upload Tally or Busy purchase registers with a full audit trail.',
  },
  security: {
    path: '/security',
    title: 'Security | SynTax Row-Level Security & Audit',
    description:
      'See how SynTax walls off each CA firm in PostgreSQL row-level security, protects logins with Argon2id and TOTP MFA and masks PANs in audit-logged views.',
  },
  contact: {
    path: '/contact',
    title: 'Contact SynTax | Book Demo & CA Support India',
    description:
      'Book a 30-minute walkthrough on your own client list, ask about annual firm pricing, get migration guidance or contact SynTax support and Grievance Officer.',
  },
  whatsNew: {
    path: '/whats-new',
    title: "What's New | SynTax Product & Tax Releases",
    description:
      'Follow recent SynTax releases across Tally and Busy purchase imports, GSTR-2B matching, dual-Act TDS Forms 138 to 144, Protean FVU and client portals.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy Notice | SynTax DPDP Act Compliance',
    description:
      'Read how Synex Labs collects, processes and protects account and client tax records in AWS Mumbai under the Digital Personal Data Protection Act, 2023.',
  },
  terms: {
    path: '/terms',
    title: 'Terms of Service | SynTax Software Agreement',
    description:
      'Review the software terms of service between Synex Labs and participating CA firms governing GST, TDS, pre-check workflows and local USB DSC signing.',
  },
} as const;
