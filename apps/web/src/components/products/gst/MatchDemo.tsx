'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from '../../landing/primitives';

/**
 * One invoice through the matcher. Each case is a real outcome of the reconciliation engine
 * (workers/queue-worker/src/recon/reconciliationEngine.ts), with the line the CA would read.
 */
type Line = { no: string; date: string; taxable: string; heads: Array<[string, string]> };
type Case = {
  key: string;
  tab: string;
  books: Line;
  twoB: Line | null;
  verdict: string;
  tone: 'claim' | 'check' | 'hold';
  note: string;
  /** Which fields differ between the two sides, to highlight. */
  differs?: Array<'no' | 'date' | 'taxable' | 'heads'>;
};

const CASES: Case[] = [
  {
    key: 'exact',
    tab: 'Exact',
    books: { no: 'BL/0082', date: '01 Nov 2025', taxable: '2,10,560.71', heads: [['CGST', '18,950.46'], ['SGST', '18,950.46']] },
    twoB: { no: 'BL/0082', date: '01 Nov 2025', taxable: '2,10,560.71', heads: [['CGST', '18,950.46'], ['SGST', '18,950.46']] },
    verdict: 'Exact match',
    tone: 'claim',
    note: 'Number, date, value and each tax head agree. The credit goes into this month’s 3B.',
  },
  {
    key: 'spelling',
    tab: 'Written differently',
    books: { no: 'SALES/25-26/0049', date: '02 Nov 2025', taxable: '1,96,068.20', heads: [['CGST', '17,646.14'], ['SGST', '17,646.14']] },
    twoB: { no: 'SALES252649', date: '02 Nov 2025', taxable: '1,96,068.60', heads: [['CGST', '17,646.14'], ['SGST', '17,646.14']] },
    verdict: 'Matched, same invoice',
    tone: 'claim',
    note: 'Slashes, the year and leading zeros are evened out before comparing, and a 40 paise rounding gap is allowed.',
    differs: ['no', 'taxable'],
  },
  {
    key: 'heads',
    tab: 'Wrong tax heads',
    books: { no: 'JF/2025/311', date: '07 Nov 2025', taxable: '1,00,000.00', heads: [['IGST', '18,000.00']] },
    twoB: { no: 'JF/2025/311', date: '07 Nov 2025', taxable: '1,00,000.00', heads: [['CGST', '9,000.00'], ['SGST', '9,000.00']] },
    verdict: 'Value mismatch',
    tone: 'hold',
    note: 'Same total, but booked as IGST and reported as CGST + SGST. Check the place of supply with the supplier before claiming.',
    differs: ['heads'],
  },
  {
    key: 'month',
    tab: 'Dated last month',
    books: { no: 'AP-4512', date: '03 Nov 2025', taxable: '45,000.00', heads: [['IGST', '8,100.00']] },
    twoB: { no: 'AP-4512', date: '28 Oct 2025', taxable: '45,000.00', heads: [['IGST', '8,100.00']] },
    verdict: 'Probable match',
    tone: 'check',
    note: 'Number and values agree but 2B dates it in October. Confirm it is the same document before it goes into 3B.',
    differs: ['date'],
  },
  {
    key: 'missing',
    tab: 'Not in 2B',
    books: { no: 'GT/77', date: '15 Nov 2025', taxable: '95,000.00', heads: [['CGST', '8,550.00'], ['SGST', '8,550.00']] },
    twoB: null,
    verdict: 'Not in 2B yet',
    tone: 'hold',
    note: 'The supplier has not reported it. Keep it out of this month’s claim and ask them to file.',
  },
];

const TONE = {
  claim: { dot: 'bg-mint', text: 'text-ink', strip: 'bg-mint' },
  check: { dot: 'bg-sky', text: 'text-ink', strip: 'bg-sky' },
  hold: { dot: 'bg-ink', text: 'text-white', strip: 'bg-ink' },
} as const;

function Side({ label, line, c, field }: { label: string; line: Line | null; c: Case; field: 'books' | '2b' }) {
  const hit = (f: 'no' | 'date' | 'taxable' | 'heads') => c.differs?.includes(f);
  const mark = 'rounded-[3px] bg-sky/15 px-1 -mx-1 text-sky-deep';
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <p className="text-[11px] text-ink-soft">{label}</p>
      {line ? (
        <dl className="mt-2.5 space-y-1.5 text-[12.5px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-soft">Invoice</dt>
            <dd className={`min-w-0 text-right font-medium tabular-nums [overflow-wrap:anywhere] ${hit('no') ? mark : 'text-ink'}`}>{line.no}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-soft">Date</dt>
            <dd className={`tabular-nums ${hit('date') ? mark : 'text-ink'}`}>{line.date}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-soft">Taxable</dt>
            <dd className={`tabular-nums ${hit('taxable') ? mark : 'text-ink'}`}>&#8377;{line.taxable}</dd>
          </div>
          {line.heads.map(([h, v]) => (
            <div key={h} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">{h}</dt>
              <dd className={`tabular-nums ${hit('heads') ? mark : 'text-ink'}`}>&#8377;{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-ink-soft">
          {field === '2b' ? 'No document from this supplier with this number in the November 2B.' : ''}
        </p>
      )}
    </div>
  );
}

export function MatchDemo() {
  const [active, setActive] = useState(1);
  const reduce = useReducedMotion();
  const c = CASES[active];
  const tone = TONE[c.tone];

  return (
    <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <LogoMark size={16} /> 2B match, November 2025
        </p>
        <p className="hidden text-[11px] text-ink-soft sm:block">03ZZZCS0010Z1ZG</p>
      </div>

      <div role="tablist" aria-label="Choose an invoice" className="flex flex-wrap gap-1.5 border-b border-hairline px-3.5 py-2.5 sm:px-5">
        {CASES.map((x, i) => (
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
          key={c.key}
          role="tabpanel"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 divide-hairline">
            <Side label="Your purchase register" line={c.books} c={c} field="books" />
            <Side label="GSTR-2B" line={c.twoB} c={c} field="2b" />
          </div>
          <div className={`flex items-start gap-3 px-4 py-3.5 sm:px-5 ${tone.strip} ${tone.text}`}>
            <div className="min-w-0">
              <p className="text-[14px] font-medium tracking-[-0.01em]">{c.verdict}</p>
              <p className={`mt-0.5 text-[12px] leading-[1.5] ${c.tone === 'hold' ? 'text-white/75' : 'text-ink/75'}`}>{c.note}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
