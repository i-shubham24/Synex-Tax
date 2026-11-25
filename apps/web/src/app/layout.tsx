import type { Metadata } from 'next';
import { Inter_Tight, Poppins, Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';
import { PublicLayoutWrapper } from '../components/PublicLayoutWrapper';

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
  title: 'SynTax | GST, TDS and Income Tax for CA Practices',
  description:
    'Cloud GST and dual-Act TDS filing for Chartered Accountants: IMS, 2B reconciliation, Forms 138 to 144, FVU validation and local DSC signing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${poppins.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-white text-ink antialiased flex flex-col font-sans">
        <AuthProvider>
          <PublicLayoutWrapper>{children}</PublicLayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
