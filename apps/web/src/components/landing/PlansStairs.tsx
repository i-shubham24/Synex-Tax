'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Brain, FileText } from 'lucide-react';
import { PixelField } from './primitives';

const TIERS = [
  {
    tier: 'Tier 1',
    name: 'Scale practice',
    price: '29,999',
    blurb: 'e-Invoice and e-Way Bill, vendor trust scores, notice tracker, a dedicated account manager.',
    quota: '600 GSTINs, 300 TANs, unlimited seats',
    icon: BadgeCheck,
  },
  {
    tier: 'Tier 2',
    name: 'Growth firm',
    price: '15,999',
    blurb: 'Partner-only exports, client portal, Tally and Busy sync, crunch-week support till 10 PM.',
    quota: '200 GSTINs, 100 TANs, unlimited seats',
    icon: Brain,
  },
  {
    tier: 'Tier 3',
    name: 'Solo practitioner',
    price: '8,999',
    blurb: 'GSTR-1 and 3B, 2B recon and IMS, dual-Act TDS, local DSC signer.',
    quota: '50 GSTINs, 25 TANs, 3 seats',
    icon: FileText,
  },
];

export function PlansStairs() {
  const [active, setActive] = useState(1);

  return (
    <section id="pricing" className="site-base px-3 py-10 sm:px-6 sm:py-14 lg:px-10" aria-labelledby="plans-title">
      <div data-nav-theme="dark" className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[30px] bg-night text-white sm:rounded-[38px]">
        <div className="flex items-center justify-between px-7 pt-6 text-[11px] text-white/70 sm:px-10">
          <span>SynexTax</span>
          <span>Annual plans, plus GST</span>
        </div>

        <div className="grid gap-10 px-7 pb-10 pt-8 sm:px-10 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:pb-14">
          <div className="flex flex-col justify-between">
            <h2 id="plans-title" className="text-[clamp(48px,5.6vw,84px)] font-medium leading-[0.98] tracking-[-0.05em]">
              Our Three
              <br />
              Service
              <br />
              Plans
            </h2>
            <p className="mt-10 text-[11px] text-white/50">/ 2026 - 2027 /</p>
          </div>

          <div className="relative">
            <p className="max-w-[13rem] text-[12px] leading-[1.45] text-white/80 lg:absolute lg:left-0 lg:top-0">
              Every plan includes all statutory updates and unlimited cloud storage.
            </p>

            {/* Staircase on desktop: Tier 1 top right, Tier 3 bottom left */}
            <div className="relative mt-8 grid gap-3 lg:mt-0 lg:block lg:h-[440px]">
              {TIERS.map((t, i) => {
                const Icon = t.icon;
                const isActive = active === i;
                const pos = [
                  'lg:right-0 lg:top-0',
                  'lg:right-[32%] lg:top-[115px]',
                  'lg:right-[64%] lg:top-[230px]',
                ][i];
                return (
                  <motion.button
                    key={t.tier}
                    type="button"
                    onClick={() => setActive(i)}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    aria-pressed={isActive}
                    animate={{ y: isActive ? -8 : 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className={`pixel-host relative overflow-hidden rounded-[8px] p-5 text-left text-ink lg:absolute lg:w-[36%] ${pos} ${
                      isActive ? 'bg-sky shadow-[0_24px_50px_-20px_rgba(82,176,248,0.7)]' : 'bg-sky/90'
                    }`}
                    style={{ zIndex: isActive ? 5 : 3 - i }}
                  >
                    <PixelField seed={100 + i} count={18} cell={12} cols={20} rows={10} maxOpacity={0.25} />
                    <span className="relative flex items-start justify-between">
                      <span className="text-[clamp(34px,3.3vw,48px)] font-medium leading-none tracking-[-0.05em]">{t.tier}</span>
                      <Icon className="mt-1 h-5 w-5" strokeWidth={2.2} />
                    </span>
                    <span className="relative mt-3 block text-[13px] font-semibold">{t.name}</span>
                    <span className="relative mt-1 block max-w-[17rem] text-[11px] leading-[1.45] text-ink/80">{t.blurb}</span>
                    <motion.span
                      initial={false}
                      animate={{ height: isActive ? 'auto' : 0, opacity: isActive ? 1 : 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="relative block overflow-hidden"
                    >
                      <span className="mt-3 flex items-end justify-between border-t border-ink/20 pt-3">
                        <span className="text-[24px] font-medium leading-none tracking-[-0.04em] tabular-nums">
                          &#8377;{t.price}
                          <span className="ml-1 text-[11px] font-normal text-ink/70">/ year</span>
                        </span>
                      </span>
                      <span className="mt-1 block text-[10.5px] text-ink/75">{t.quota}</span>
                    </motion.span>
                  </motion.button>
                );
              })}
            </div>

            <p className="mt-8 max-w-[17rem] text-[11px] leading-[1.5] text-white/70 lg:absolute lg:bottom-0 lg:right-0 lg:mt-0">
              No per-PC node fees. Prices exclude 18% GST. Founding pilot firms get 40% off for life.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
