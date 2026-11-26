'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { PixelField } from '../landing/primitives';

const YEARS = ['FY 2022-23', 'FY 2023-24', 'FY 2024-25', 'FY 2025-26'];

/**
 * Desktop software keeps each financial year apart; SynTax keeps one history per client.
 * The old years sit as separate grey blocks, the new one rises once as a single mint step.
 */
export function YearsToHistory() {
  const reduce = useReducedMotion();
  return (
    <div className="pt-4 lg:px-10">
      <div className="grid grid-cols-1 gap-6 sm:h-[300px] sm:grid-cols-12 sm:items-end sm:gap-0">
        {/* Desktop software: one database per year */}
        <div className="sm:col-span-7 sm:h-full sm:pr-3">
          <div className="flex h-full flex-col">
            <p className="text-[12.5px] text-ink-soft">Desktop software</p>
            <div className="mt-3 grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
              {YEARS.map((y) => (
                <div key={y} className="flex h-[110px] flex-col justify-between rounded-[8px] bg-white p-4 ring-1 ring-ink/10 sm:h-[58%] sm:rounded-b-none">
                  <p className="text-[14px] font-medium tracking-[-0.02em] text-ink">{y}</p>
                  <p className="text-[12px] leading-[1.4] text-ink-soft">Its own database and backup</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SynTax: one history */}
        <motion.div
          className="pixel-host relative flex min-h-[180px] flex-col overflow-hidden rounded-[10px] bg-mint p-6 text-ink sm:col-span-5 sm:h-full sm:rounded-b-none"
          style={{ transformOrigin: 'bottom' }}
          initial={reduce ? false : { scaleY: 0.58 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <PixelField seed={53} count={40} cell={15} cols={22} rows={12} color="#c9f9d8" maxOpacity={0.75} />
          <p className="relative text-[12.5px] text-ink/70">SynTax</p>
          <p className="relative mt-auto text-[clamp(22px,2.2vw,30px)] font-medium leading-tight tracking-[-0.035em]">One history per client</p>
          <p className="relative mt-2 max-w-[22rem] text-[13px] leading-[1.5] text-ink/75">
            Every year since you added them, in one place, with every change logged.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
