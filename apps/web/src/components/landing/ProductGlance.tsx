'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Eyebrow, LogoMark, PixelField, SplitButton, Stat } from './primitives';

/** Monthly due dates the workspace runs to, for a monthly GST filer. */
const DEADLINES: Array<[string, string]> = [
  ['7th', 'TDS deposit'],
  ['11th', 'GSTR-1'],
  ['14th', 'IMS actions'],
  ['20th', 'GSTR-3B'],
];

const PERIODS = {
  Monthly: { amount: '4,82,310', delta: '+10.1%', split: [71, 18, 11] },
  Quarterly: { amount: '13,96,540', delta: '+6.4%', split: [76, 15, 9] },
} as const;

/** Roles stand in for the reference's avatar stack: the people who touch a return. */
export function RoleStack() {
  const roles = [
    { k: 'P', c: '#52b0f8', t: 'Partner' },
    { k: 'M', c: '#5fe88a', t: 'Manager' },
    { k: 'S', c: '#f2c14a', t: 'Staff' },
  ];
  return (
    <div className="flex items-center">
      {roles.map((r, i) => (
        <span
          key={r.k}
          title={r.t}
          className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[13px] font-medium text-ink first:ml-0"
          style={{ background: r.c, zIndex: 3 - i }}
        >
          {r.k}
        </span>
      ))}
      <span className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm">
        <LogoMark size={20} tone="ink" />
      </span>
    </div>
  );
}

function ItcCard() {
  const [period, setPeriod] = useState<keyof typeof PERIODS>('Monthly');
  const [open, setOpen] = useState(false);
  const d = PERIODS[period];
  return (
    <div className="relative w-[230px] rounded-[10px] bg-white p-3.5 shadow-[0_18px_40px_-18px_rgba(20,40,80,0.35)] ring-1 ring-black/5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink">
        <LogoMark size={14} /> SynTax
      </p>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <p className="text-[10px] text-ink-soft">ITC available</p>
          <p className="text-[19px] font-medium leading-tight tracking-[-0.03em] tabular-nums">&#8377;{d.amount}</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1 rounded-full border border-ink/70 px-2 py-0.5 text-[9.5px]"
          >
            {period} <ChevronDown className="h-3 w-3" />
          </button>
          {open && (
            <ul className="absolute right-0 top-6 z-10 w-24 rounded-md bg-white p-1 text-[10px] shadow-lg ring-1 ring-black/10">
              {(Object.keys(PERIODS) as Array<keyof typeof PERIODS>).map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriod(p);
                      setOpen(false);
                    }}
                    className={`w-full rounded px-2 py-1 text-left hover:bg-mist ${p === period ? 'font-medium' : ''}`}
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="relative mt-2 h-[78px] rounded-md bg-gradient-to-b from-[#f2f4f7] to-white">
        <svg viewBox="0 0 200 78" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="itc-line" x1="0" x2="1">
              <stop offset="0" stopColor="#52b0f8" />
              <stop offset="1" stopColor="#5fe88a" />
            </linearGradient>
          </defs>
          {[40, 80, 120, 160].map((x) => (
            <line key={x} x1={x} x2={x} y1="0" y2="78" stroke="#e9ebef" />
          ))}
          <motion.path
            key={period}
            d="M2 74 C 60 74, 110 68, 140 48 S 180 18, 192 6"
            fill="none"
            stroke="url(#itc-line)"
            strokeWidth="2.4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: false, amount: 0.6 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
          <circle cx="176" cy="20" r="4.5" fill="#fff" stroke="#5fe88a" strokeWidth="2.5" />
        </svg>
        <span className="absolute right-6 top-1.5 rounded bg-white px-1.5 py-0.5 text-[8.5px] shadow-sm ring-1 ring-black/5 tabular-nums">
          {d.delta} <span className="text-mint">&#8593;</span>
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1 text-[8.5px] text-ink-soft">
        {[
          ['Matched', '#5fe88a'],
          ['Partial', '#52b0f8'],
          ['Missing', '#141416'],
        ].map(([l, c], i) => (
          <div key={l}>
            <p className="flex items-center gap-1">
              <i className="h-1.5 w-1.5" style={{ background: c }} />
              {l}
            </p>
            <p className="text-[11px] font-medium text-ink tabular-nums">{d.split[i]}%</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
        <span className="bg-mint transition-colors duration-700" style={{ width: `${d.split[0]}%` }} />
        <span className="bg-sky transition-colors duration-700" style={{ width: `${d.split[1]}%` }} />
        <span className="bg-ink transition-colors duration-700" style={{ width: `${d.split[2]}%` }} />
      </div>
    </div>
  );
}

function ImsBars() {
  const bars = [34, 52, 44, 78, 60, 70];
  return (
    <div className="relative h-[180px] w-[150px] overflow-hidden rounded-[10px] bg-gradient-to-b from-[#e8f3fe] to-white p-3 shadow-[0_18px_40px_-20px_rgba(20,40,80,0.3)] ring-1 ring-black/5">
      <span className="absolute left-[38%] top-2 rounded bg-white px-1 text-[8px] shadow-sm tabular-nums">Day 4</span>
      <div className="absolute inset-x-3 top-[46px] border-t border-dashed border-mint" />
      <div className="absolute inset-x-3 bottom-[46px] flex h-[96px] items-end gap-[5px]">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className={`relative flex-1 overflow-hidden rounded-t-[3px] ${i === 3 ? 'bg-gradient-to-b from-mint to-sky' : 'bg-[#dde9f5]'}`}
            initial={{ height: 0 }}
            whileInView={{ height: `${h}%` }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.9, delay: 0.06 * i, ease: [0.16, 1, 0.3, 1] }}
          >
            {i === 3 && <PixelField seed={7} count={10} cell={6} cols={3} rows={14} color="#ffffff" maxOpacity={0.5} anchor="full" />}
          </motion.span>
        ))}
      </div>
      <p className="absolute bottom-6 left-3 text-[11px] font-medium text-ink">IMS actions</p>
      <p className="absolute bottom-2.5 left-3 text-[8.5px] text-ink-soft">by day, up to the 14th</p>
    </div>
  );
}

export function ProductGlance() {
  return (
    <section id="product" className="bg-white px-3 py-5 sm:px-6 sm:py-8 lg:px-10" aria-labelledby="glance-title">
      <div className="round-light mx-auto max-w-[1480px] overflow-hidden rounded-[30px] sm:rounded-[38px]">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,17fr)_minmax(0,33fr)_minmax(0,38fr)_minmax(0,12fr)]">
          {/* Top row */}
          <div className="border-b border-hairline p-6 lg:border-r lg:p-7">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <LogoMark size={18} /> Every month
            </p>
            <dl className="mt-6 space-y-1.5 text-[12px]">
              {DEADLINES.map(([day, what]) => (
                <div key={what} className="flex gap-3">
                  <dt className="w-9 shrink-0 tabular-nums text-ink">{day}</dt>
                  <dd className="text-ink-soft">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="hidden border-b border-r border-hairline p-6 lg:flex lg:items-start lg:gap-4 lg:p-7">
            <div className="relative mt-1 h-14 w-[72px] shrink-0 overflow-hidden rounded-[4px] bg-sky">
              <span className="absolute bottom-0 left-0 h-7 w-9 bg-mint" />
              <span className="absolute right-0 top-0 h-7 w-6 bg-ink" />
              <PixelField seed={3} count={8} cell={6} cols={12} rows={9} maxOpacity={0.5} anchor="full" />
            </div>
            <div className="text-[11px] leading-[1.45]">
              <p className="font-medium text-ink">IMS</p>
              <p className="mt-1 text-ink-soft">
                Accept, reject or keep pending each supplier document before the 14th, then recompute 2B.
              </p>
            </div>
          </div>
          <div className="hidden items-center justify-between border-b border-r border-hairline p-6 lg:flex lg:flex-col lg:items-start lg:justify-start lg:gap-5 lg:p-7">
            <p className="text-[12px] leading-[1.45] text-ink-soft"><span className="font-medium text-ink">Partner, manager, staff.</span> Staff prepare, a partner or manager approves.</p>
            <RoleStack />
          </div>
          <div className="hidden border-b border-hairline lg:block" />

          {/* Bottom row */}
          <div className="relative col-span-1 min-h-[440px] overflow-hidden border-b border-hairline sm:min-h-[380px] lg:col-span-2 lg:border-b-0 lg:border-r">
            {/* Stepped blue/mint ground, as behind the reference photograph */}
            <div className="absolute bottom-0 left-0 h-[46%] w-[40%] bg-sky">
              <PixelField seed={11} count={20} cell={14} cols={12} rows={8} maxOpacity={0.25} />
            </div>
            <div className="absolute bottom-[46%] left-0 h-[10%] w-[14%] bg-mint" />
            <div className="absolute bottom-[34%] left-[40%] h-[12%] w-[8%] bg-mint" />
            <div className="absolute left-[18%] top-[12%] h-[52%] w-[44%] rounded-[12px] bg-sky">
              <PixelField seed={5} count={26} cell={12} cols={20} rows={12} maxOpacity={0.3} />
            </div>
            <div className="absolute left-[3%] top-[8%] z-10 origin-top-left max-sm:scale-[0.82] sm:left-[22%] sm:top-[17%]">
              <ImsBars />
            </div>
            <div className="absolute left-[34%] top-[12%] z-10 origin-top-left max-sm:scale-[0.82] sm:left-[44%] sm:top-[16%]">
              <ItcCard />
            </div>
            <div className="absolute bottom-0 right-0 flex h-[36%] w-[72%] items-end justify-between rounded-tl-[14px] bg-white px-5 pb-6 sm:h-[42%] sm:w-[52%] sm:px-7 sm:pb-8 lg:pl-10">
              <Stat value="4" sup="pass" label="Fuzzy 2B matching" />
              <div className="-translate-y-6 sm:-translate-y-12">
                <Stat value="20" sup="max" supTone="sky" label="Sections in one 281N challan" />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between border-hairline p-6 lg:border-r lg:p-9">
            <div>
              <Eyebrow>GST and TDS workspace</Eyebrow>
              <h2
                id="glance-title"
                className="mt-5 text-[clamp(38px,4.2vw,62px)] font-medium leading-[1.02] tracking-[-0.045em] text-ink"
              >
                One desk for
                <br />
                every client.
              </h2>
            </div>
            <div className="mt-10 border-t border-hairline pt-6">
              <p className="max-w-[24rem] text-[12.5px] leading-[1.6] text-ink-soft">
                Staff prepare, partners approve, and every change is logged for the auditors. Add a client once and GST,
                TDS and signing all use it.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-5">
                <SplitButton href="/signup">Start 14-day free trial</SplitButton>
                <Link href="/products/gst" className="text-[12.5px] font-medium text-ink hover:underline">
                  See how GST works
                </Link>
              </div>
            </div>
          </div>
          <div className="hidden lg:block" />
        </div>
      </div>
    </section>
  );
}
