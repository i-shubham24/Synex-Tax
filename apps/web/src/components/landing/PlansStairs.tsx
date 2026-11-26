'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Brain, FileText, Check, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { PixelField } from './primitives';

export interface PlanTier {
  id: string;
  name: string;
  price: string;
  period: string;
  blurb: string;
  quota: string;
  suites: string[];
  features: string[];
  popular?: boolean;
}

export const ALL_IN_ONE_PLANS: PlanTier[] = [
  {
    id: 'solo',
    name: 'Solo Practitioner',
    price: '8,999',
    period: '/ year',
    blurb: 'Complete compliance suite for individual CAs and emerging practice partners.',
    quota: '50 GSTINs, 25 TANs, 3 seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'All 4 core product suites unlocked',
      '4-pass fuzzy GSTR-2B reconciliation',
      'Native IMS console with 1-period CN lock',
      'Dual-Act TDS cutover router & Forms 138 to 144',
      'Zero-Java Go USB DSC agent with FIPS detection',
      'Unified 4-tier Client Master & audit log',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Firm',
    price: '15,999',
    period: '/ year',
    blurb: 'Full-featured compliance operating system for expanding accounting practices.',
    quota: '200 GSTINs, 100 TANs, unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Solo Practitioner',
      'Partner maker-checker approval queue',
      'Anti-poaching partner export protection',
      'MCA Rule 3(1) edit log & Rule 3(6) vault',
      'DPDP multilingual consent tracking',
      'Extended crunch-week support till 10 PM',
    ],
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale Practice',
    price: '29,999',
    period: '/ year',
    blurb: 'High-throughput enterprise compliance engine for multi-partner firms.',
    quota: '600 GSTINs, 300 TANs, unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Growth Firm',
      'Dedicated account manager & priority SLA',
      'Custom Tally / Busy migration assistance',
      'Multi-branch practice control tower',
      'High-volume Docker FVU validation queue',
      'Phase 2 early access: WhatsApp client portal',
    ],
  },
];

export const STANDALONE_PLANS: PlanTier[] = [
  {
    id: 'gst-sign',
    name: 'SynTax GST + Sign',
    price: '5,999',
    period: '/ year',
    blurb: 'Dedicated GST compliance and digital signature suite with instant upgrade path.',
    quota: '50 GSTINs, unlimited DSC signing, 3 seats',
    suites: ['SynTax GST', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'GSTR-1, 1A, IFF & auto HSN tables',
      '4-pass fuzzy GSTR-2B reconciliation engine',
      'Native IMS console before 14th recompute lock',
      'Hard-locked GSTR-3B set-off (Rule 88A / 86B)',
      'Zero-Java Go 1.27 USB DSC signer (PKCS#11)',
      '1-click in-app upgrade to All-in-One suite',
    ],
  },
  {
    id: 'tds-sign',
    name: 'SynTax TDS + Sign',
    price: '4,999',
    period: '/ year',
    blurb: 'Dual-Act TDS return filing and batch certificate signing engine.',
    quota: '25 TANs, unlimited DSC signing, 3 seats',
    suites: ['SynTax TDS', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'IT Act 1961 vs IT Act 2025 cutover router',
      'ITNS 281 vs ITNS 281N 20-section challans',
      'CSI matching & bulk PAN operative checks',
      'Forms 138 to 144 + legacy 24Q/26Q/27Q/27EQ',
      'Isolated Docker FVU v1.2 / v9.5 validation',
      '1-click in-app upgrade to All-in-One suite',
    ],
  },
];

export function PlansStairs({ standaloneDefault = false }: { standaloneDefault?: boolean }) {
  const [tab, setTab] = useState<'all' | 'standalone'>(standaloneDefault ? 'standalone' : 'all');
  const activePlans = tab === 'all' ? ALL_IN_ONE_PLANS : STANDALONE_PLANS;

  return (
    <section id="pricing" className="site-base px-3 py-10 sm:px-6 sm:py-14 lg:px-10" aria-labelledby="plans-title">
      <div data-nav-theme="dark" className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[30px] bg-night text-white sm:rounded-[38px] p-6 sm:p-10 lg:p-12">
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <span className="text-[12px] font-semibold text-mint uppercase tracking-wider">Transparent Practice Pricing</span>
            <h2 id="plans-title" className="mt-1 text-[clamp(32px,3.8vw,56px)] font-medium leading-[1.05] tracking-[-0.04em]">
              Simple, Predictable Plans
            </h2>
          </div>

          {/* Tab Switcher */}
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                tab === 'all'
                  ? 'bg-mint text-ink shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              All-in-One Suites (All 4 Unlocked)
            </button>
            <button
              type="button"
              onClick={() => setTab('standalone')}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                tab === 'standalone'
                  ? 'bg-sky text-ink shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Standalone Entry Packs
            </button>
          </div>
        </div>

        {/* Note on shared Client Master */}
        <div className="mt-6 flex items-center justify-between text-[12.5px] text-white/60">
          <p>
            {tab === 'all'
              ? 'Every all-in-one plan unlocks SynTax GST, SynTax TDS, SynTax Sign, and SynTax Desk under one unified Client Master.'
              : 'Standalone packs give you focused compliance power today with 1-click in-app upgrade using the exact same Client Master.'}
          </p>
          <span className="hidden md:inline font-mono text-[11px] text-white/40">/ FY 2026-27 /</span>
        </div>

        {/* Pricing Cards Grid (SSR-safe HTML) */}
        <div className={`mt-8 grid gap-6 ${tab === 'all' ? 'lg:grid-cols-3' : 'lg:grid-cols-2 max-w-4xl mx-auto'}`}>
          {activePlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-6 sm:p-7 transition-all ${
                plan.popular
                  ? 'border-mint bg-white/[0.08] shadow-[0_20px_45px_-15px_rgba(82,232,136,0.25)]'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 right-6 rounded-full bg-mint px-3 py-0.5 text-[11px] font-semibold text-ink">
                  Most Popular For CA Firms
                </span>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[20px] font-semibold text-white tracking-tight">{plan.name}</h3>
                </div>
                <p className="mt-2 text-[13px] text-white/70 leading-relaxed min-h-[40px]">{plan.blurb}</p>

                <div className="mt-6 flex items-baseline gap-1 border-y border-white/10 py-4">
                  <span className="text-[14px] text-white/60 font-medium">Rs</span>
                  <span className="text-[36px] font-semibold text-white tracking-tight tabular-nums">{plan.price}</span>
                  <span className="text-[13px] text-white/60">{plan.period}</span>
                </div>

                <div className="mt-3 text-[12px] font-medium text-mint">
                  {plan.quota}
                </div>

                <div className="mt-6 space-y-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Included Capabilities</p>
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-start gap-2.5 text-[13px] text-white/80">
                      <Check className="h-4 w-4 shrink-0 text-mint mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-white/10">
                <Link
                  href="/signup"
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-all ${
                    plan.popular
                      ? 'bg-mint text-ink hover:bg-mint/90 shadow-md'
                      : 'bg-white text-ink hover:bg-white/90'
                  }`}
                >
                  <span>Start 14-day free trial</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-2 text-center text-[11px] text-white/45">
                  Instant access to Amritsar sample client workspace
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Guarantee Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-mint" />
            <span>No per-PC dongle fees. Unlimited cloud storage. 18% GST additional.</span>
          </div>
          <Link href="/contact" className="text-white hover:text-mint font-medium transition-colors">
            Need custom volume or multi-branch setup? Talk with our engineering team
          </Link>
        </div>
      </div>
    </section>
  );
}
