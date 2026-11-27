import { SITE_URL, BRAND_NAME, OPERATOR_NAME } from './meta';

export type JsonLdObject = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Sitewide Organization + WebSite entities grounded in verified legal entity records. */
export function buildSitewideGraph(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'ProfessionalService'],
        '@id': ORG_ID,
        name: OPERATOR_NAME,
        brand: {
          '@type': 'Brand',
          name: BRAND_NAME,
        },
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/syntax-logo.png`,
          width: 397,
          height: 232,
        },
        email: 'hello@synextax.in',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Amritsar',
          addressRegion: 'Punjab',
          addressCountry: 'IN',
        },
        areaServed: {
          '@type': 'Country',
          name: 'India',
        },
        priceRange: '₹4,999 - ₹29,999 / year',
        currenciesAccepted: 'INR',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'support@synextax.in',
            areaServed: 'IN',
            availableLanguage: ['en', 'hi', 'pa'],
          },
          {
            '@type': 'ContactPoint',
            contactType: 'sales',
            email: 'hello@synextax.in',
            areaServed: 'IN',
            availableLanguage: ['en', 'hi', 'pa'],
          },
        ],
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: SITE_URL,
        name: BRAND_NAME,
        publisher: { '@id': ORG_ID },
        inLanguage: 'en-IN',
      },
    ],
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** BreadcrumbList schema starting cleanly from Home. */
export function buildBreadcrumbSchema(items: BreadcrumbItem[]): JsonLdObject {
  const full = [{ name: 'Home', path: '/' }, ...items.filter((i) => i.path !== '/')];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: full.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === '/' ? '/' : item.path}`,
    })),
  };
}

export function buildHomeSchema(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#software`,
        name: BRAND_NAME,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Tax & Accounting Compliance Software',
        operatingSystem: 'Web, Windows 10, Windows 11',
        publisher: { '@id': ORG_ID },
        provider: { '@id': ORG_ID },
        url: SITE_URL,
        inLanguage: 'en-IN',
        featureList: [
          'GSTR-1 and GSTR-3B return preparation with Rule 88A set-off',
          'Sub-second Tally & Busy purchase register to GSTR-2B matching and IMS',
          'Dual-Act TDS & TCS (1961 Act 24Q/26Q/27Q/27EQ and 2025 Act Forms 138 to 144)',
          'Bank CSI challan matching, TRACES conso parsing and Protean FVU desktop checks',
          'Class 3 USB token DSC signing without Java',
          'Client master, client upload links and tamper-evident hash-chained audit trail',
        ],
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'INR',
          lowPrice: '4999',
          highPrice: '29999',
          offerCount: 5,
          availability: 'https://schema.org/InStock',
        },
      },
      {
        '@type': 'ItemList',
        name: 'SynTax Compliance Suites',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'SynTax GST', url: `${SITE_URL}/products/gst` },
          { '@type': 'ListItem', position: 2, name: 'SynTax TDS', url: `${SITE_URL}/products/tds` },
          { '@type': 'ListItem', position: 3, name: 'SynTax Sign', url: `${SITE_URL}/products/sign` },
          { '@type': 'ListItem', position: 4, name: 'SynTax Desk', url: `${SITE_URL}/products/desk` },
        ],
      },
    ],
  };
}

export interface SuiteSchemaInput {
  path: string;
  name: string;
  description: string;
  lowPrice: string;
  highPrice: string;
  features: string[];
  howToTitle?: string;
  howToSteps?: Array<{ name: string; text: string }>;
}

/** SoftwareApplication + Offer + optional HowTo for each suite hub page. */
export function buildSuiteSchema(input: SuiteSchemaInput): JsonLdObject {
  const nodes: JsonLdObject[] = [
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}${input.path}#software`,
      name: input.name,
      description: input.description,
      url: `${SITE_URL}${input.path}`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Windows',
      provider: { '@id': ORG_ID },
      featureList: input.features,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: input.lowPrice,
        highPrice: input.highPrice,
        availability: 'https://schema.org/InStock',
      },
    },
  ];

  if (input.howToTitle && input.howToSteps?.length) {
    nodes.push({
      '@type': 'HowTo',
      name: input.howToTitle,
      step: input.howToSteps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}

export interface PricingTierInput {
  name: string;
  priceInr: string;
  description: string;
}

/** OfferCatalog + FAQPage schema for /pricing without rating inflation. */
export function buildPricingSchema(
  tiers: PricingTierInput[],
  faqs: Array<{ q: string; a: string }>,
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'OfferCatalog',
        '@id': `${SITE_URL}/pricing#catalog`,
        name: 'SynTax Annual Firm Plans',
        itemListElement: tiers.map((tier, idx) => ({
          '@type': 'Offer',
          position: idx + 1,
          name: `SynTax ${tier.name}`,
          description: tier.description,
          price: tier.priceInr.replace(/,/g, ''),
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: `${SITE_URL}/pricing#plans`,
          seller: { '@id': ORG_ID },
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  };
}

export function buildHowToSchema(name: string, steps: Array<{ name: string; text: string }>): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}
