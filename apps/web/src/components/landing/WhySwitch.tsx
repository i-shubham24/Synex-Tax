'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Chips, Eyebrow, LogoMark, PixelField, Stat } from './primitives';

// Pain points CA firms describe with desktop suites, and what changes. Not testimonials.
const REASONS = [
  {
    before: 'Service packs arrive as zip files the night before a deadline.',
    after: 'Updates ship overnight and nothing gets installed.',
    who: 'Updates',
    note: 'Regulatory changes behind feature flags',
  },
  {
    before: 'The licence lives on one office PC.',
    after: 'Partners approve from home, staff work from the branch.',
    who: 'Access',
    note: 'Role-based logins with TOTP',
  },
  {
    before: 'emSigner loses its port and the return waits.',
    after: 'A 15 MB signer talks to the token directly, no Java.',
    who: 'Signing',
    note: 'FIPS 140-2 and 140-3 tokens',
  },
  {
    before: 'Each financial year sits in its own database.',
    after: 'One continuous history for every client since onboarding.',
    who: 'Data',
    note: 'Hosted in Mumbai, backed up in Hyderabad',
  },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Showing SynexTax' : 'Showing desktop software'}
      onClick={() => onChange(!on)}
      className={`relative mx-1.5 inline-flex h-[0.78em] w-[1.5em] translate-y-[0.06em] items-center rounded-full align-middle transition-colors duration-300 ${
        on ? 'bg-sky' : 'bg-ink/20'
      }`}
    >
      <span
        className={`absolute h-[0.62em] w-[0.62em] rounded-full bg-white shadow transition-[left] duration-300 ease-out-expo ${
          on ? 'left-[calc(100%-0.7em)]' : 'left-[0.08em]'
        }`}
      />
    </button>
  );
}

export function WhySwitch() {
  const [cloud, setCloud] = useState(true);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % REASONS.length), 6000);
    return () => window.clearInterval(id);
  }, [paused]);

  const r = REASONS[i];
  const go = (d: number) => setI((x) => (x + d + REASONS.length) % REASONS.length);

  return (
    <section id="why" className="bg-white px-3 py-5 sm:px-6 sm:py-8 lg:px-10" aria-labelledby="why-title">
      <div className="round-light mx-auto max-w-[1480px] overflow-hidden rounded-[30px] sm:rounded-[38px] grid lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        {/* Left column */}
        <div className="border-b border-hairline lg:border-b-0 lg:border-r">
          <div className="border-b border-hairline p-6 sm:p-9">
            <Eyebrow tone="sky">What changes</Eyebrow>
            <p className="mt-3 max-w-[15rem] text-[11px] leading-[1.5] text-ink-soft">
              We break down the filing calendar into steps your team already understands.
            </p>
          </div>
          <div className="p-6 sm:p-9">
            <h2 id="why-title" className="max-w-[34rem] text-[clamp(28px,2.9vw,42px)] font-normal leading-[1.18] tracking-[-0.035em] text-ink">
              We connect clarity and compliance{' '}
              <Toggle on={cloud} onChange={setCloud} />{' '}
              so your team can breathe easy
              <span className="ml-2 inline-flex translate-y-[0.08em] items-center align-middle">
                <span className="h-[0.8em] w-[0.8em] rounded-full bg-ink" />
                <span className="-ml-[0.25em] flex h-[0.8em] w-[0.8em] items-center justify-center rounded-full bg-mint">
                  <LogoMark size={11} />
                </span>
              </span>
            </h2>
            <p className="mt-3 text-[11px] text-ink-faint">
              Toggle to compare: {cloud ? 'SynexTax in the cloud' : 'a typical desktop suite'}.
            </p>

            <div className="mt-10 grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-end gap-6">
              <div className="space-y-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={cloud ? 'c1' : 'd1'}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    {cloud ? (
                      <Stat value="8" sup="yrs" label="Audit trail retained" size="lg" />
                    ) : (
                      <Stat value="1" sup="yr" supTone="sky" label="Database per financial year" size="lg" />
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="pl-[30%]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={cloud ? 'c2' : 'd2'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3, delay: 0.05 }}
                    >
                      {cloud ? (
                        <Stat value="0" sup="zips" label="Service packs to install" />
                      ) : (
                        <Stat value="1" sup="PC" supTone="sky" label="Where the licence works" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              {/* Stepped mint block standing in for the reference portrait */}
              <div className="relative aspect-[4/3.4] overflow-hidden rounded-[6px] bg-ink">
                <motion.div
                  animate={{ height: cloud ? '72%' : '38%' }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-0 w-[34%] bg-mint-pale"
                />
                <motion.div
                  animate={{ height: cloud ? '46%' : '22%' }}
                  transition={{ duration: 0.6, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute left-[34%] top-0 w-[22%] bg-mint-pale"
                />
                <motion.div
                  animate={{ height: cloud ? '58%' : '30%' }}
                  transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 right-0 w-[44%] bg-mint"
                >
                  <PixelField seed={61} count={16} cell={12} cols={10} rows={12} color="#ffffff" maxOpacity={0.35} />
                </motion.div>
                <div className="absolute left-[40%] top-[48%] w-[54%] -translate-x-1/4 rounded-md bg-white p-2.5 shadow-xl">
                  <p className="text-[9px] text-ink-soft">GSTR-3B, Oct 2026</p>
                  <p className="mt-0.5 text-[12px] font-medium text-ink">{cloud ? 'Filed with DSC' : 'Waiting for emSigner'}</p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-mist">
                    <motion.span
                      className={`block h-full ${cloud ? 'bg-mint' : 'bg-[#ffb020]'}`}
                      animate={{ width: cloud ? '100%' : '42%' }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col">
          <div className="hidden h-[156px] items-end border-b border-hairline p-9 lg:flex">
            <p className="text-[18px] font-medium tracking-[-0.03em]">&copy;2026 SynexTax</p>
          </div>
          <div className="border-b border-hairline p-6 sm:p-9">
            <Chips items={['Zero install', 'Partner approvals', 'Local signer', 'Continuous history', 'Punjabi support']} more={3} />
          </div>
          <div
            className="flex flex-1 flex-col justify-between p-6 sm:p-9"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div>
              <div className="flex gap-1.5" role="tablist" aria-label="Reasons to switch">
                {REASONS.map((x, k) => (
                  <button
                    key={x.who}
                    type="button"
                    role="tab"
                    aria-selected={k === i}
                    aria-label={x.who}
                    onClick={() => setI(k)}
                    className={`h-2.5 transition-all duration-500 ${k === i ? 'w-7 bg-mint' : 'w-2.5 bg-mist hover:bg-hairline'}`}
                  />
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-7 max-w-[30rem] text-[clamp(20px,1.9vw,27px)] leading-[1.3] tracking-[-0.03em]"
                >
                  <span className="text-ink">{r.before}</span> <span className="text-ink-faint">{r.after}</span>
                </motion.blockquote>
              </AnimatePresence>
            </div>
            <div className="mt-10 flex items-end justify-between">
              <div>
                <p className="text-[13px] font-medium">{r.who}</p>
                <p className="text-[10.5px] text-ink-soft">{r.note}</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous reason"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/25 transition-colors hover:bg-ink hover:text-white"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next reason"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/25 transition-colors hover:bg-ink hover:text-white"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
