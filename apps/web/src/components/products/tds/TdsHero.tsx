'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark, PixelField } from '../../landing/primitives';
import { SuiteHero } from '../ProductSections';

/** What the quarter's health check flags before filing (packages/tax-engine/src/tds/health.ts). */
const FLAGS = [
  { what: '3 rows deducted short', cost: '₹4,860' },
  { what: 'Interest on 2 late deposits', cost: '₹1,240' },
  { what: 'Challan 00417 has tax unused', cost: '₹2,000' },
];

export function HealthCard() {
  return (
    <div className="w-[270px] rounded-[12px] bg-white p-4 shadow-[0_24px_50px_-24px_rgba(20,40,80,0.45)] ring-1 ring-black/[0.06]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
        <LogoMark size={14} /> Sample deductor, before Q3
      </p>
      <ul className="mt-3 space-y-2">
        {FLAGS.map((f) => (
          <li key={f.what} className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2 text-[12px]">
            <span className="text-ink">{f.what}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">{f.cost}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SIDES = [
  { when: 'Up to 31 March 2026', act: 'Income-tax Act, 1961', rows: ['24Q, 26Q, 27Q and 27EQ', 'ITNS 281 challans', 'Protean FVU 9.5'] },
  { when: 'From 1 April 2026', act: 'Income-tax Act, 2025', rows: ['Forms 138, 140, 143 and 144', 'ITNS 281N challans', 'Protean FVU 1.2'] },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

/** January to July 2026, the old Act stepping up into the new one at 1 April. */
function Cutover() {
  const reduce = useReducedMotion();
  return (
    <div className="pt-6 lg:px-10">
      <div className="relative grid grid-cols-1 gap-3 sm:h-[330px] sm:grid-cols-7 sm:items-end sm:gap-0">
        {/* 1961 Act: the lower step */}
        <div className="flex flex-col rounded-[10px] bg-white p-5 ring-1 ring-ink/10 sm:col-span-3 sm:h-[62%] sm:rounded-b-none sm:rounded-r-none sm:p-7">
          <p className="text-[12.5px] text-ink-soft">{SIDES[0].when}</p>
          <p className="mt-2 text-[clamp(20px,2vw,28px)] font-medium leading-tight tracking-[-0.03em] text-ink">{SIDES[0].act}</p>
          <ul className="mt-auto space-y-1 pt-6 text-[13.5px] text-ink-soft">
            {SIDES[0].rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>

        {/* 2025 Act: the higher step, rising once on load */}
        <motion.div
          className="pixel-host relative flex flex-col overflow-hidden rounded-[10px] bg-mint p-5 sm:col-span-4 sm:h-full sm:rounded-b-none sm:rounded-l-none sm:p-7"
          style={{ transformOrigin: 'bottom' }}
          initial={reduce ? false : { scaleY: 0.62 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <PixelField seed={61} count={44} cell={16} cols={26} rows={12} color="#c9f9d8" maxOpacity={0.75} />
          <p className="relative text-[12.5px] text-ink/70">{SIDES[1].when}</p>
          <p className="relative mt-2 text-[clamp(20px,2vw,28px)] font-medium leading-tight tracking-[-0.03em] text-ink">{SIDES[1].act}</p>
          <ul className="relative mt-auto space-y-1 pt-6 text-[13.5px] text-ink">
            {SIDES[1].rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </motion.div>

        {/* The cut-over line */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[42.857%] hidden w-px bg-ink sm:block">
          <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-full bg-ink px-3 py-1 text-[12px] text-white">
            1 April 2026
          </span>
        </div>
      </div>

      <div aria-hidden className="hidden grid-cols-7 border-t border-ink/15 pt-2 text-[11.5px] text-ink-faint sm:grid">
        {MONTHS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

export function TdsHero() {
  return (
    <SuiteHero
      layout="stacked"
      suite="SynTax TDS"
      titleId="tds-title"
      title={<>Two Acts, one&nbsp;quarter, no&nbsp;mix&#8209;ups.</>}
      body={
        <p>
          SynTax files every row under the Act its date belongs to, writes the statement in Protean&rsquo;s format and runs
          Protean&rsquo;s FVU on your PC.
        </p>
      }
      price="TDS + Sign is ₹4,999 a year"
      visual={<Cutover />}
      footer={<p>Statements are due 31 July, 31 October, 31 January and 31 May.</p>}
    />
  );
}
