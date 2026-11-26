import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '../../components/landing/SiteNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { PlansStairs } from '../../components/landing/PlansStairs';
import { Check, HelpCircle, Shield, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pricing | SynTax All-in-One CA Practice Suites',
  description:
    'Simple, transparent pricing for Indian CA firms. All-in-One practice suites starting at Rs 8,999/yr, or standalone GST and TDS entry packs with instant 1-click in-app upgrades.',
};

const COMPARISON_ROWS = [
  { feature: 'Core Product Suites', solo: 'All 4 Suites', growth: 'All 4 Suites', scale: 'All 4 Suites' },
  { feature: 'GSTIN Quota', solo: '50 GSTINs', growth: '200 GSTINs', scale: '600 GSTINs' },
  { feature: 'TAN Quota', solo: '25 TANs', growth: '100 TANs', scale: '300 TANs' },
  { feature: 'Team Seats', solo: '3 Seats', growth: 'Unlimited', scale: 'Unlimited' },
  { feature: 'GSTR-1, 1A, IFF & Auto HSN', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: '4-Pass Fuzzy GSTR-2B Recon', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Native IMS Console with 1-Period CN Lock', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Hard-Locked 3B Set-Off Engine (Rule 88A/86B)', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Dual-Act TDS Router (1961 vs 2025 Act)', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'ITNS 281N 20-Section Challans', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Docker Isolated FVU Farm v1.2 / v9.5', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Zero-Java Go 1.27 USB DSC Signer', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'TRACES PAdES Batch Form 130 to 133 Signing', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Partner Maker-Checker RBAC Guard', solo: 'Optional', growth: 'Included', scale: 'Included' },
  { feature: 'Anti-Poaching Partner Export Protection', solo: 'Optional', growth: 'Included', scale: 'Included' },
  { feature: 'MCA Rule 3(1) Edit Log & 3(6) Audit Vault', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'DPDP Multilingual Consent Tracker', solo: 'Included', growth: 'Included', scale: 'Included' },
  { feature: 'Dedicated Account Manager & Crunch Support', solo: 'Standard', growth: 'Till 10 PM', scale: 'Priority SLA' },
];

const FAQS = [
  {
    q: 'Can I start with just SynTax GST and add SynTax TDS later?',
    a: 'Yes. You can subscribe to the Standalone GST + Sign pack today. When you are ready for TDS, click Activate TDS in your dashboard. Because all suites share the same 4-tier Client Master, all your entities, PANs, GSTINs, and staff assignments work immediately without re-entering data.',
  },
  {
    q: 'How does the 14-day free trial work?',
    a: 'Your trial immediately unlocks all 4 suites: SynTax GST, SynTax TDS, SynTax Sign, and SynTax Desk. You can test with our pre-seeded Amritsar sample clients, or create up to 3 real practice clients with live GSTR-2B and TDS filing validation.',
  },
  {
    q: 'Do you charge per PC or workstation?',
    a: 'No. SynTax is cloud-native with local Go USB DSC signing. You can sign in from your office desktop, your home laptop, or your tablet with no per-PC licensing keys or dongles.',
  },
  {
    q: 'How do we migrate from SmartBiz, CompuTax, or Winman?',
    a: 'SynTax Desk includes a 10-Minute Migration Wizard that imports your client master, entity PANs, GSTINs, and TRACES consolidated files with automatic deduplication.',
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-white pt-24">
        {/* Main Pricing Hero & Tabs */}
        <div className="mx-auto max-w-[1480px] px-4 sm:px-8 pt-8">
          <div className="text-center max-w-2xl mx-auto mb-6">
            <span className="text-[12px] font-semibold text-sky-deep uppercase tracking-wider">
              Transparent CA Practice Plans
            </span>
            <h1 className="mt-2 font-display text-[clamp(36px,4.5vw,60px)] font-semibold leading-[1.05] tracking-tight text-ink">
              One Subscription. Four Unified Suites.
            </h1>
            <p className="mt-4 text-[16px] text-ink/70 leading-relaxed">
              Replace fragmented desktop software with one integrated compliance OS backed by a single 4-tier Client Master.
            </p>
          </div>
        </div>

        {/* Stepped Pricing Section with All-in-One and Standalone Packs */}
        <PlansStairs />

        {/* Feature Comparison Matrix */}
        <section className="mx-auto max-w-[1480px] px-4 sm:px-8 py-16">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="font-display text-[28px] font-semibold tracking-tight text-ink">
              Detailed Suite Comparison
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              Every all-in-one tier includes the full power of our statutory engines with clear volume tiers.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink/10 shadow-sm bg-white">
            <table className="w-full text-left text-[13.5px] border-collapse font-sans">
              <thead>
                <tr className="border-b border-ink/10 bg-slate-50 text-[12.5px] font-semibold uppercase tracking-wider text-ink/70">
                  <th className="py-4 px-6 w-1/2">Capability</th>
                  <th className="py-4 px-6 text-center">Solo (Rs 8,999)</th>
                  <th className="py-4 px-6 text-center bg-mint/10 text-ink">Growth (Rs 15,999)</th>
                  <th className="py-4 px-6 text-center">Scale (Rs 29,999)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr key={row.feature} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-3.5 px-6 font-medium text-ink">{row.feature}</td>
                    <td className="py-3.5 px-6 text-center text-ink/75">{row.solo}</td>
                    <td className="py-3.5 px-6 text-center font-semibold text-ink bg-mint/5">{row.growth}</td>
                    <td className="py-3.5 px-6 text-center text-ink/75">{row.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mx-auto max-w-[1200px] px-4 sm:px-8 py-12 border-t border-ink/10">
          <div className="text-center max-w-lg mx-auto mb-10">
            <h2 className="font-display text-[26px] font-semibold tracking-tight text-ink">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-[14px] text-ink/60">
              Clear answers regarding statutory compliance, client capacity, and practice migration.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {FAQS.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-ink/10 bg-slate-50/60 p-6">
                <h3 className="font-display text-[16px] font-semibold text-ink">{faq.q}</h3>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink/75">{faq.a}</p>
              </div>
            ))}
          </div>

          {/* Bottom Trial Banner */}
          <div className="mt-14 rounded-2xl bg-slate-900 text-white p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
            <div>
              <span className="text-[12px] font-semibold text-mint uppercase tracking-wider">No Credit Card Required</span>
              <h3 className="mt-1 font-display text-[24px] sm:text-[28px] font-semibold tracking-tight">
                Ready to Experience SynTax in Your Practice?
              </h3>
              <p className="mt-1 text-[14px] text-white/70 max-w-xl">
                Start your 14-day full-access trial today with instant access to our Amritsar sample clients.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <Link
                href="/signup"
                className="flex h-11 items-center gap-2 rounded-xl bg-mint px-6 text-[14px] font-semibold text-ink hover:bg-mint/90 transition-all shadow-md"
              >
                <span>Start 14-day free trial</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
