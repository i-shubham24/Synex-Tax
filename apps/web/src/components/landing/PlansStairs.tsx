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
    blurb: 'For a CA working alone or with one or two staff.',
    quota: '50 GSTINs, 25 TANs, 3 seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'GST, TDS, signing and Desk',
      'Purchase register and GSTR-2B matching',
      'IMS actions before the 14th',
      'TDS under both Acts, Forms 138 to 144',
      'Signing with your USB token, no Java',
      'Client master and audit trail',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Firm',
    price: '15,999',
    period: '/ year',
    blurb: 'For a firm with a team handling a few hundred clients.',
    quota: '200 GSTINs, 100 TANs, unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Solo',
      '200 GSTINs and 100 TANs',
      'As many people as you need',
      'Screens and clients set per staff member',
      'Consent records in English, Punjabi and Hindi',
      'Support until 10 PM in filing weeks',
    ],
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale Practice',
    price: '29,999',
    period: '/ year',
    blurb: 'For multi-partner firms and firms with branches.',
    quota: '600 GSTINs, 300 TANs, unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Growth',
      '600 GSTINs and 300 TANs',
      'A named account manager',
      'Priority support',
      'We move your Tally and Busy data for you',
      'Early access to the client WhatsApp portal',
    ],
  },
];

export const STANDALONE_PLANS: PlanTier[] = [
  {
    id: 'gst-sign',
    name: 'SynTax GST + Sign',
    price: '5,999',
    period: '/ year',
    blurb: 'GST returns and signing, with Desk Lite.',
    quota: '50 GSTINs, unlimited DSC signing, 3 seats',
    suites: ['SynTax GST', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'GSTR-1, 1A and IFF from the sales register',
      'Purchase register and GSTR-2B matching',
      'IMS actions before the 14th',
      'GSTR-3B set-off in the Rule 88A order',
      'Signing with your USB token, no Java',
      'Add TDS later without re-entering clients',
    ],
  },
  {
    id: 'tds-sign',
    name: 'SynTax TDS + Sign',
    price: '4,999',
    period: '/ year',
    blurb: 'TDS and TCS statements and signing, with Desk Lite.',
    quota: '25 TANs, unlimited DSC signing, 3 seats',
    suites: ['SynTax TDS', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'Rows routed to the 1961 or 2025 Act by date',
      'ITNS 281 and 281N challans, matched to CSI',
      'Forms 138 to 144, and 24Q, 26Q, 27Q, 27EQ',
      'Checked with Protean FVU 1.2 and 9.5',
      'Form 130 and 131 certificates checked and sent',
      'Add GST later without re-entering clients',
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
            <span className="text-[13px] text-mint">Pricing</span>
            <h2 id="plans-title" className="mt-1 text-[clamp(32px,3.8vw,56px)] font-medium leading-[1.05] tracking-[-0.04em]">
              One price a year for the whole firm
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
              All four suites
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
              GST or TDS only
            </button>
          </div>
        </div>

        {/* Note on shared Client Master */}
        <div className="mt-6 flex items-center justify-between text-[12.5px] text-white/60">
          <p>
            {tab === 'all'
              ? 'Every all-in-one plan has GST, TDS, signing and Desk, working from the same client list.'
              : 'Start with GST or TDS alone. When you add the other, your clients are already there.'}
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
                  Best for a team
                </span>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[20px] font-semibold text-white tracking-tight">{plan.name}</h3>
                </div>
                <p className="mt-2 text-[13px] text-white/70 leading-relaxed min-h-[40px]">{plan.blurb}</p>

                <div className="mt-6 flex items-baseline gap-1 border-y border-white/10 py-4">
                  <span className="text-[22px] text-white/80 font-medium">&#8377;</span>
                  <span className="text-[36px] font-semibold text-white tracking-tight tabular-nums">{plan.price}</span>
                  <span className="text-[13px] text-white/60">{plan.period}</span>
                </div>

                <div className="mt-3 text-[12px] font-medium text-mint">
                  {plan.quota}
                </div>

                <div className="mt-6 space-y-2.5">
                  <p className="text-[12px] text-white/50">What’s included</p>
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
              </div>
            </div>
          ))}
        </div>

        {/* Footer Guarantee Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-mint" />
            <span>Prices are a year, before 18% GST. No per-PC fees.</span>
          </div>
          <Link href="/contact" className="text-white hover:text-mint font-medium transition-colors">
            More than 600 GSTINs, or several branches? Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
