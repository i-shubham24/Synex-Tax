'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from '../../landing/primitives';

/**
 * One payment either side of 1 April 2026. Sections, codes and rates are the ones the engine
 * uses (packages/tax-engine/src/tds/rates2025.ts and dualActRecon.ts).
 */
type Side = { section: string; code: string };
type Payment = { key: string; tab: string; rate: string; threshold: string; old: Side; next: Side };

const PAYMENTS: Payment[] = [
  { key: 'contract', tab: 'Contractor', rate: '1% (2% for a firm or company)', threshold: '₹30,000 a bill or ₹1,00,000 a year', old: { section: '194C', code: '94C' }, next: { section: '393(1) Table 6(i)', code: '1023 / 1024' } },
  { key: 'prof', tab: 'Professional fees', rate: '10%', threshold: '₹50,000 a year', old: { section: '194J(b)', code: '4JB' }, next: { section: '393(1) Table 6(iii)(b)', code: '1027' } },
  { key: 'rent', tab: 'Office rent', rate: '10%', threshold: '₹50,000 a month', old: { section: '194I(b)', code: '4IB' }, next: { section: '393(1) Table 2(ii)(b)', code: '1009' } },
  { key: 'comm', tab: 'Commission', rate: '2%', threshold: '₹20,000 a year', old: { section: '194H', code: '94H' }, next: { section: '393(1) Table 1(ii)', code: '1006' } },
  { key: 'int', tab: 'Interest', rate: '10%', threshold: '₹10,000 a year', old: { section: '194A', code: '94A' }, next: { section: '393(1) Table 5(iii)', code: '1022' } },
];

const ROWS: Array<{ label: string; old: (p: Payment) => string; next: (p: Payment) => string }> = [
  { label: 'Act', old: () => 'Income-tax Act, 1961', next: () => 'Income-tax Act, 2025' },
  { label: 'Statement', old: () => '26Q, Q4 FY 2025-26', next: () => 'Form 140, Q1 TY 2026-27' },
  { label: 'Section', old: (p) => p.old.section, next: (p) => p.next.section },
  { label: 'Code', old: (p) => p.old.code, next: (p) => p.next.code },
  { label: 'Challan', old: () => 'ITNS 281', next: () => 'ITNS 281N' },
  { label: 'Checked with', old: () => 'FVU 9.5', next: () => 'FVU 1.2' },
  { label: 'Statement due', old: () => '31 May 2026', next: () => '31 Jul 2026' },
];

export function CutoverDemo() {
  const [active, setActive] = useState(1);
  const reduce = useReducedMotion();
  const p = PAYMENTS[active];

  return (
    <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <LogoMark size={16} /> Same payment, either side of 1 April
        </p>
      </div>

      <div role="tablist" aria-label="Choose a payment" className="flex flex-wrap gap-1.5 border-b border-hairline px-3.5 py-2.5 sm:px-5">
        {PAYMENTS.map((x, i) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] sm:px-3 sm:text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky ${
              i === active ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink hover:border-ink/50'
            }`}
          >
            {x.tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={p.key}
          role="tabpanel"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Mobile stacked 2-column comparison so detail labels never collide */}
          <div className="divide-y divide-hairline px-3.5 py-2 sm:hidden">
            <div className="grid grid-cols-2 gap-3 pb-2 pt-1 text-[11px] font-medium text-ink-soft">
              <span>Paid 28 Mar 2026</span>
              <span>Paid 6 Apr 2026</span>
            </div>
            {ROWS.map((r) => (
              <div key={r.label} className="py-2">
                <p className="text-[11px] font-medium text-ink-soft">{r.label}</p>
                <div className="mt-1 grid grid-cols-2 gap-3 text-[12px] leading-snug tabular-nums">
                  <span className="text-ink/85">{r.old(p)}</span>
                  <span className="font-medium text-ink">{r.next(p)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tablet/Desktop 3-column lookup table */}
          <table className="hidden w-full table-fixed border-collapse text-left text-[12.5px] sm:table">
            <thead>
              <tr className="text-[11px] text-ink-soft">
                <th className="w-[26%] px-5 pb-1.5 pt-3 font-normal"><span className="sr-only">Detail</span></th>
                <th className="px-3 pb-1.5 pt-3 font-normal">Paid 28 Mar 2026</th>
                <th className="px-3 pb-1.5 pt-3 pr-5 font-normal">Paid 6 Apr 2026</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-hairline align-top">
                  <th scope="row" className="px-5 py-1.5 font-normal text-ink-soft">{r.label}</th>
                  <td className="px-3 py-1.5 tabular-nums text-ink [overflow-wrap:anywhere]">{r.old(p)}</td>
                  <td className="px-3 py-1.5 pr-5 font-medium tabular-nums text-ink [overflow-wrap:anywhere]">{r.next(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1.5 bg-mint px-3.5 py-3.5 text-ink sm:px-5">
            <p className="text-[14px] font-medium tracking-[-0.01em]">Rate {p.rate} on both sides</p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-ink/75">
              Deducted once {p.threshold} is crossed. Nine days apart, it belongs to a different statement, so SynTax routes
              each row by the date it was paid or credited.
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
