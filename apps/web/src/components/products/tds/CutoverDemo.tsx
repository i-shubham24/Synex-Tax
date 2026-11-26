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

      <div role="tablist" aria-label="Choose a payment" className="flex gap-1.5 overflow-x-auto border-b border-hairline px-4 py-2.5 sm:px-5 [scrollbar-width:none]">
        {PAYMENTS.map((x, i) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky ${
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
          <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-ink-soft">
                <th className="w-[28%] px-4 pb-1.5 pt-3 font-normal sm:px-5"><span className="sr-only">Detail</span></th>
                <th className="px-2 pb-1.5 pt-3 font-normal">Paid 28 Mar 2026</th>
                <th className="px-2 pb-1.5 pt-3 pr-4 font-normal sm:pr-5">Paid 6 Apr 2026</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-hairline align-top">
                  <th scope="row" className="px-4 py-1.5 font-normal text-ink-soft sm:px-5">{r.label}</th>
                  <td className="px-2 py-1.5 tabular-nums text-ink [overflow-wrap:anywhere]">{r.old(p)}</td>
                  <td className="px-2 py-1.5 pr-4 font-medium tabular-nums text-ink [overflow-wrap:anywhere] sm:pr-5">{r.next(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1.5 bg-mint px-4 py-3.5 text-ink sm:px-5">
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
