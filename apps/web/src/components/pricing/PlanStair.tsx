'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { PixelField } from '../landing/primitives';

/** The three all-in-one plans as steps, each a size of firm. Prices are a year, before GST. */
const STEPS = [
  { name: 'Solo', price: '8,999', limits: '50 GSTINs, 25 TANs, 3 people', tone: 'bg-white text-ink ring-1 ring-ink/10', sub: 'text-ink-soft' },
  { name: 'Growth', price: '15,999', limits: '200 GSTINs, 100 TANs, any team', tone: 'bg-ink text-white', sub: 'text-white/60' },
  { name: 'Scale', price: '29,999', limits: '600 GSTINs, 300 TANs, any team', tone: 'bg-mint text-ink', sub: 'text-ink/70' },
];

function Step({ s, pixels }: { s: (typeof STEPS)[number]; pixels?: boolean }) {
  return (
    <>
      {pixels && <PixelField seed={91} count={30} cell={14} cols={18} rows={10} color="#c9f9d8" maxOpacity={0.75} />}
      <p className="relative text-[15px] font-medium tracking-[-0.02em]">{s.name}</p>
      <p className="relative mt-auto text-[clamp(30px,3vw,42px)] font-medium leading-none tracking-[-0.05em] tabular-nums">
        &#8377;{s.price}
        <span className={`ml-1.5 text-[13px] font-normal tracking-normal ${s.sub}`}>a year</span>
      </p>
      <p className={`relative mt-2 text-[12.5px] ${s.sub}`}>{s.limits}</p>
    </>
  );
}

export function PlanStair() {
  const reduce = useReducedMotion();
  return (
    <div className="w-full py-6 lg:py-0">
      {/* Wide screens: the plans step up with the size of the firm */}
      <div className="relative hidden h-[480px] sm:block">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.name}
            className={`pixel-host absolute flex h-[180px] w-[44%] flex-col overflow-hidden rounded-[10px] p-6 ${s.tone}`}
            style={{ left: `${i * 28}%`, top: `${(2 - i) * 31}%` }}
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 + i * 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            <Step s={s} pixels={i === 2} />
          </motion.div>
        ))}
      </div>

      {/* Phones: one under another */}
      <ul className="grid gap-2 sm:hidden">
        {STEPS.map((s, i) => (
          <li key={s.name} className={`pixel-host relative flex h-[150px] flex-col overflow-hidden rounded-[10px] p-5 ${s.tone}`}>
            <Step s={s} pixels={i === 2} />
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[13px] text-ink-soft">
        Or one suite alone: GST + Sign at &#8377;5,999, or TDS + Sign at &#8377;4,999 a year.
      </p>
    </div>
  );
}
