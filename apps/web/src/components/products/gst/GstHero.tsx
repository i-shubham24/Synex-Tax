'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from '../../landing/primitives';
import { SuiteHero } from '../ProductSections';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The next monthly-filer deadline from today: GSTR-1 on the 11th, IMS by the 14th, GSTR-3B on the 20th. */
function nextDeadline(today: Date) {
  const steps: Array<[number, string]> = [
    [11, 'GSTR-1'],
    [14, 'IMS actions'],
    [20, 'GSTR-3B'],
  ];
  for (let add = 0; add < 2; add++) {
    const y = today.getFullYear();
    const m = today.getMonth() + add;
    for (const [day, what] of steps) {
      const due = new Date(y, m, day);
      if (due >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        const period = new Date(y, m - 1, 1);
        const days = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
        return {
          what,
          period: MONTHS[period.getMonth()],
          due: `${DAYS[due.getDay()]} ${due.getDate()} ${MONTHS[due.getMonth()].slice(0, 3)}`,
          days,
        };
      }
    }
  }
  return null;
}

/**
 * How one sample client's November credit splits after matching. The figures are the totals
 * the matcher produces on the synthetic register in tests/golden-fixtures (dataset a).
 */
const SPLIT = [
  { label: 'Claim now', amount: '82.37', pct: 89.3, color: 'bg-mint' },
  { label: 'Held back', amount: '8.66', pct: 9.4, color: 'bg-ink' },
  { label: 'Next month', amount: '1.21', pct: 1.3, color: 'bg-sky' },
];

export function SplitCard() {
  const reduce = useReducedMotion();
  return (
    <div className="w-full max-w-[280px] rounded-[12px] bg-white p-4 shadow-[0_24px_50px_-24px_rgba(20,40,80,0.45)] ring-1 ring-black/[0.06]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
        <LogoMark size={14} /> Sample client, November
      </p>
      <p className="mt-3 text-[11px] text-ink-soft">Credit in your books</p>
      <p className="text-[24px] font-medium leading-tight tracking-[-0.035em] tabular-nums text-ink">&#8377;92,24,244</p>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-mist" aria-hidden>
        {SPLIT.map((s, i) => (
          <motion.span
            key={s.label}
            className={`h-full ${s.color}`}
            initial={reduce ? { width: `${s.pct}%` } : { width: 0 }}
            whileInView={{ width: `${s.pct}%` }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 1.1, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {SPLIT.map((s) => (
          <div key={s.label}>
            <dt className="flex items-center gap-1 text-[10px] text-ink-soft">
              <span className={`h-2 w-2 rounded-[2px] ${s.color}`} aria-hidden />
              {s.label}
            </dt>
            <dd className="mt-0.5 text-[12px] sm:text-[13px] font-medium tabular-nums text-ink">&#8377;{s.amount} L</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Due dates in a month for a monthly filer, plus PMT-06 for quarterly clients. */
const PILLARS: Array<{ day: number; label: string; height: string; tone: 'mint' | 'sky' }> = [
  { day: 11, label: 'GSTR-1', height: '38%', tone: 'mint' },
  { day: 14, label: 'IMS', height: '58%', tone: 'mint' },
  { day: 20, label: 'GSTR-3B', height: '84%', tone: 'mint' },
  { day: 25, label: 'PMT-06', height: '26%', tone: 'sky' },
];

/**
 * The month as a strip of days, the deadlines rising from it. The current month and today are
 * read in the browser; before that the strip shows a 31-day month with no day marked.
 */
function MonthStrip() {
  const reduce = useReducedMotion();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const days = now ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() : 31;
  const today = now?.getDate() ?? -1;
  const caption = now ? `${MONTHS[now.getMonth()]} ${now.getFullYear()}, returns for ${MONTHS[(now.getMonth() + 11) % 12]}` : ' ';

  return (
    <div className="lg:px-10">
      <p className="mb-4 text-[12.5px] text-ink-soft" aria-live="polite">{caption}</p>

      {/* Wide screens: every day of the month */}
      <div className="relative hidden h-[300px] sm:block lg:h-[340px]" aria-hidden>
        <div className="grid h-full items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const pillar = PILLARS.find((x) => x.day === d);
            const isToday = d === today;
            return (
              <div key={d} className="relative flex h-full flex-col justify-end">
                {pillar && (
                  <motion.div
                    className={`relative mb-[3px] rounded-t-[6px] ${pillar.tone === 'mint' ? 'bg-mint' : 'bg-sky'}`}
                    style={{ height: pillar.height, transformOrigin: 'bottom' }}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.9, delay: 0.25 + PILLARS.indexOf(pillar) * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] lg:text-[13px] font-medium tracking-[-0.01em] text-ink">
                      {pillar.label}
                    </span>
                  </motion.div>
                )}
                {isToday && !pillar && (
                  <span className="absolute bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] text-ink">Today</span>
                )}
                <span
                  className={`flex h-9 items-center justify-center rounded-[4px] text-[10px] lg:text-[11px] tabular-nums ${
                    isToday ? 'bg-ink text-white' : pillar ? 'bg-white font-medium text-ink ring-1 ring-ink/15' : 'bg-white/70 text-ink-faint ring-1 ring-ink/[0.06]'
                  }`}
                >
                  {d}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: bounded proportional bar track */}
      <ul className="space-y-2.5 pb-6 sm:hidden">
        {PILLARS.map((p) => (
          <li key={p.day} className="flex items-center gap-2.5">
            <span className="w-8 shrink-0 text-[12.5px] tabular-nums text-ink">{p.day}th</span>
            <div className="min-w-0 flex-1 h-3 overflow-hidden rounded-[4px] bg-white/80">
              <span className={`block h-full rounded-[4px] ${p.tone === 'mint' ? 'bg-mint' : 'bg-sky'}`} style={{ width: p.height }} aria-hidden />
            </div>
            <span className="w-16 shrink-0 text-right text-[12.5px] font-medium text-ink">{p.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GstHero() {
  const [deadline, setDeadline] = useState<ReturnType<typeof nextDeadline>>(null);
  // Worked out in the browser so it reads the visitor's today, not the build's.
  useEffect(() => setDeadline(nextDeadline(new Date())), []);

  return (
    <SuiteHero
      layout="stacked"
      suite="SynTax GST"
      titleId="gst-title"
      title={<>Books and 2B, matched before the&nbsp;14th.</>}
      body={
        <p>
          Upload the purchase register as Tally or Busy exports it, and the GSTR&#8209;2B file from the portal. See what to claim,
          what to check and whom to chase.
        </p>
      }
      price="GST + Sign is ₹5,999 a year"
      visual={<MonthStrip />}
      footer={
        <p aria-live="polite" className="min-h-[20px]">
          {deadline && (
            <>
              Next up: <span className="text-ink">{deadline.what} for {deadline.period}</span>, due {deadline.due}
              {deadline.days === 0 ? ' (today)' : deadline.days === 1 ? ' (tomorrow)' : ` (in ${deadline.days} days)`}. Quarterly
              clients pay PMT-06 by the 25th.
            </>
          )}
        </p>
      }
    />
  );
}
