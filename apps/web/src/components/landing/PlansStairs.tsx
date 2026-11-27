'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react';

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
    period: '/ yr',
    blurb: 'For a CA working alone or with 1-2 staff.',
    quota: '50 GSTINs · 25 TANs · 3 seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'GSTR-1, 2B recon, IMS & Rule 88A 3B',
      'Dual-Act TDS (1961 & 2025) + Protean FVU',
      'USB token DSC signing without Java',
      'Unified Client Master & audit trail',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Firm',
    price: '15,999',
    period: '/ yr',
    blurb: 'For firms managing a few hundred clients.',
    quota: '200 GSTINs · 100 TANs · Unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Solo, scaled to 200 GSTINs',
      'Unlimited staff & partner logins',
      'Role & client-level access controls',
      'Priority support until 10 PM in filing week',
    ],
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale Practice',
    price: '29,999',
    period: '/ yr',
    blurb: 'For multi-partner and multi-branch firms.',
    quota: '600 GSTINs · 300 TANs · Unlimited seats',
    suites: ['SynTax GST', 'SynTax TDS', 'SynTax Sign', 'SynTax Desk'],
    features: [
      'Everything in Growth, scaled to 600 GSTINs',
      'Named account manager & priority SLA',
      'Assisted Tally & Busy data migration',
      'Early access to Client WhatsApp Portal',
    ],
  },
];

export const STANDALONE_PLANS: PlanTier[] = [
  {
    id: 'gst-sign',
    name: 'SynTax GST + Sign',
    price: '5,999',
    period: '/ yr',
    blurb: 'GST returns & DSC signing, with Desk Lite.',
    quota: '50 GSTINs · Unlimited DSC · 3 seats',
    suites: ['SynTax GST', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'GSTR-1, 1A, IFF & 4-pass 2B matching',
      'IMS actions & Rule 88A GSTR-3B',
      'USB token DSC signing without Java',
      'Upgrade to add TDS later in 1 click',
    ],
  },
  {
    id: 'tds-sign',
    name: 'SynTax TDS + Sign',
    price: '4,999',
    period: '/ yr',
    blurb: 'Dual-Act TDS & signing, with Desk Lite.',
    quota: '25 TANs · Unlimited DSC · 3 seats',
    suites: ['SynTax TDS', 'SynTax Sign', 'SynTax Desk Lite'],
    features: [
      'Date-routed 1961 & 2025 Act statements',
      'ITNS 281 / 281N challans matched to CSI',
      'Checked with Protean FVU 1.2 & 9.5',
      'Form 130 / 131 batch PAdES signing',
    ],
  },
];

export function PlansStairs({ standaloneDefault = false }: { standaloneDefault?: boolean }) {
  const [tab, setTab] = useState<'all' | 'standalone'>(standaloneDefault ? 'standalone' : 'all');
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const activePlans = tab === 'all' ? ALL_IN_ONE_PLANS : STANDALONE_PLANS;

  return (
    <section id="pricing" className="site-base px-3 py-8 sm:px-6 sm:py-10 lg:px-10" aria-labelledby="plans-title">
      <div data-nav-theme="dark" className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[26px] bg-night text-white sm:rounded-[34px] p-4 sm:p-8 lg:p-9">
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
          <div>
            <span className="text-[12.5px] text-mint">Pricing</span>
            <h2 id="plans-title" className="mt-0.5 text-[clamp(26px,3.2vw,44px)] font-medium leading-[1.08] tracking-[-0.035em]">
              One price a year for the whole firm
            </h2>
          </div>

          {/* Tab Switcher */}
          <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all ${
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
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all ${
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
        <div className="mt-3.5 flex items-center justify-between text-[12px] text-white/60">
          <p>
            {tab === 'all'
              ? 'Every all-in-one plan includes GST, TDS, signing and Desk on one client list.'
              : 'Start with GST or TDS alone. Add the other later with clients already set up.'}
          </p>
          <span className="hidden md:inline font-mono text-[11px] text-white/40">/ FY 2026-27 /</span>
        </div>

        {/* Pricing Cards Grid (compact for laptop, collapsible features on mobile) */}
        <div className={`mt-5 grid gap-4 ${tab === 'all' ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-4xl mx-auto'}`}>
          {activePlans.map((plan) => {
            const isOpen = openPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 sm:p-5 transition-all ${
                  plan.popular
                    ? 'border-mint bg-white/[0.08] shadow-[0_16px_36px_-15px_rgba(82,232,136,0.22)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-mint px-2.5 py-0.5 text-[10.5px] font-semibold text-ink">
                    Best for a team
                  </span>
                )}

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px] sm:text-[18px] font-semibold text-white tracking-tight">{plan.name}</h3>
                    <div className="flex items-baseline gap-0.5 md:hidden">
                      <span className="text-[14px] text-white/80">&#8377;</span>
                      <span className="text-[22px] font-semibold text-white tabular-nums">{plan.price}</span>
                      <span className="text-[11px] text-white/60">{plan.period}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[12.5px] text-white/65 leading-snug">{plan.blurb}</p>

                  <div className="mt-3.5 hidden items-baseline gap-1 border-y border-white/10 py-2.5 md:flex">
                    <span className="text-[18px] text-white/80 font-medium">&#8377;</span>
                    <span className="text-[30px] font-semibold text-white tracking-tight tabular-nums leading-none">{plan.price}</span>
                    <span className="text-[12px] text-white/60">{plan.period}</span>
                  </div>

                  <div className="mt-2.5 text-[11.5px] font-medium text-mint">
                    {plan.quota}
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenPlan(isOpen ? null : plan.id)}
                    aria-expanded={isOpen}
                    className="mt-2.5 flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/75 md:hidden"
                  >
                    <span>What&rsquo;s included ({plan.features.length})</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <div className={`mt-3 space-y-1.5 ${isOpen ? 'block' : 'hidden md:block'}`}>
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2 text-[12.5px] text-white/80 leading-snug">
                        <Check className="h-3.5 w-3.5 shrink-0 text-mint mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/10">
                  <Link
                    href="/signup"
                    className={`flex h-9 sm:h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition-all ${
                      plan.popular
                        ? 'bg-mint text-ink hover:bg-mint/90 shadow-md'
                        : 'bg-white text-ink hover:bg-white/90'
                    }`}
                  >
                    <span>Start 14-day free trial</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Guarantee Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[12px] text-white/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-mint" />
            <span>Prices are per year, before 18% GST. No per-PC fees.</span>
          </div>
          <Link href="/contact" className="text-white hover:text-mint font-medium transition-colors">
            More than 600 GSTINs? Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
