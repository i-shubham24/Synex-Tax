import type { Metadata } from 'next';
import { Inter_Tight, Poppins, Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { PublicLayoutWrapper } from '../components/PublicLayoutWrapper';
import { JsonLd } from '../components/seo/JsonLd';
import { BRAND_NAME, SITE_URL } from '../seo/meta';
import { buildSitewideGraph } from '../seo/schema';

// Hero display face: tight neo-grotesk, matches the Legite hero reference.
const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
});

// Landing body + section headings: geometric sans, matches the TaxMate reference.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-poppins',
  display: 'swap',
});

// Dashboard face: rounded geometric, matches the ARB POS dashboard reference.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-outfit',
  display: 'swap',
});

// Statutory identifiers (GSTIN, PAN, TAN, token numbers) only.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'GST & TDS Software India | SynTax for CA Firms',
  description:
    'Prepare GSTR-1, GSTR-2B matching, IMS, dual-Act TDS Forms 138 to 144, FVU checks and USB DSC signing from one cloud workspace built for Indian CA firms.',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: BRAND_NAME,
    title: 'GST & TDS Software India | SynTax for CA Firms',
    description:
      'Prepare GSTR-1, GSTR-2B matching, IMS, dual-Act TDS Forms 138 to 144, FVU checks and USB DSC signing from one cloud workspace built for Indian CA firms.',
    images: [{ url: '/syntax-logo.png', width: 397, height: 232, alt: 'SynTax logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GST & TDS Software India | SynTax for CA Firms',
    description:
      'Prepare GSTR-1, GSTR-2B matching, IMS, dual-Act TDS Forms 138 to 144, FVU checks and USB DSC signing from one cloud workspace built for Indian CA firms.',
    images: ['/syntax-logo.png'],
  },
  icons: {
    icon: '/brand/syntax-mark-32.png',
    apple: '/brand/syntax-mark-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${poppins.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-white text-ink antialiased flex flex-col font-sans">
        <JsonLd data={buildSitewideGraph()} />
        <AuthProvider>
          <PublicLayoutWrapper>{children}</PublicLayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
