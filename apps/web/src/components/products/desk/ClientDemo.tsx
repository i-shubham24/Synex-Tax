'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogoMark } from '../../landing/primitives';

/**
 * The client master as the firm sees it: a group, its entities by PAN, and each entity's
 * registrations, people, due work, papers and fees in one place. Sample data.
 */
type Entity = {
  key: string;
  name: string;
  pan: string;
  regs: string[];
  team: string;
  due: Array<{ what: string; when: string; state: 'done' | 'open' | 'late' }>;
  papers: string;
  fee: string;
};

const GROUPS: Array<{ group: string; entities: Entity[] }> = [
  {
    group: 'Kaler group',
    entities: [
      {
        key: 'weaving',
        name: 'Kaler Weaving Works',
        pan: 'XXXXX4821K',
        regs: ['GSTIN 03, Punjab', 'GSTIN 07, Delhi', 'TAN, Amritsar'],
        team: 'Rohan prepares, Amrinder approves',
        due: [
          { what: 'GSTR-1, November', when: 'Filed 9 Dec', state: 'done' },
          { what: 'GSTR-3B, November', when: 'Due 20 Dec', state: 'open' },
          { what: 'Form 140, Q3', when: 'Due 31 Jan', state: 'open' },
        ],
        papers: '3 of 7 papers awaited, link sent 2 days ago',
        fee: '₹12,000 unpaid since 4 Nov',
      },
      {
        key: 'exports',
        name: 'Kaler Exports',
        pan: 'XXXXX7720P',
        regs: ['GSTIN 03, Punjab', 'IEC'],
        team: 'Simran prepares, Amrinder approves',
        due: [
          { what: 'GSTR-1, November', when: 'Due 11 Dec', state: 'late' },
          { what: 'GSTR-3B, November', when: 'Due 20 Dec', state: 'open' },
        ],
        papers: 'All papers in',
        fee: 'Nothing due',
      },
    ],
  },
  {
    group: 'Individual clients',
    entities: [
      {
        key: 'batala',
        name: 'Batala Steel Works',
        pan: 'XXXXX1332L',
        regs: ['GSTIN 03, Punjab, quarterly', 'TAN, Batala'],
        team: 'Rohan prepares, Meena approves',
        due: [
          { what: 'PMT-06, November', when: 'Due 25 Dec', state: 'open' },
          { what: 'Form 140, Q3', when: 'Due 31 Jan', state: 'open' },
        ],
        papers: '1 of 4 papers awaited',
        fee: '₹6,500 paid 22 Nov',
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.entities);
const DOT = { done: 'bg-mint', open: 'bg-sky', late: 'bg-ink' } as const;

export function ClientDemo() {
  const [key, setKey] = useState('weaving');
  const reduce = useReducedMotion();
  const e = ALL.find((x) => x.key === key)!;

  return (
    <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <LogoMark size={16} /> Clients
        </p>
        <p className="text-[11px] text-ink-soft">3 of 148</p>
      </div>

      <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
        {/* The tree: horizontal selector pills on mobile, grouped list on wide screens */}
        <nav aria-label="Clients" className="border-b border-hairline px-3.5 py-2.5 sm:border-b-0 sm:border-r sm:px-3 sm:py-3">
          <div className="flex flex-wrap gap-1.5 sm:hidden">
            {ALL.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => setKey(x.key)}
                aria-current={x.key === key ? 'true' : undefined}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                  x.key === key ? 'border-ink bg-ink text-white' : 'border-ink/20 text-ink hover:border-ink/50'
                }`}
              >
                {x.name}
              </button>
            ))}
          </div>
          <div className="hidden sm:block">
            {GROUPS.map((g) => (
              <div key={g.group} className="mb-2 last:mb-0">
                <p className="px-2 pb-1 text-[11px] text-ink-soft">{g.group}</p>
                <ul className="space-y-0.5">
                  {g.entities.map((x) => (
                    <li key={x.key}>
                      <button
                        type="button"
                        onClick={() => setKey(x.key)}
                        aria-current={x.key === key ? 'true' : undefined}
                        className={`w-full rounded-[6px] px-2 py-1.5 text-left text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky ${
                          x.key === key ? 'bg-ink text-white' : 'text-ink hover:bg-mist'
                        }`}
                      >
                        {x.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={e.key}
            initial={reduce ? false : { opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0 px-4 py-3.5 sm:px-5"
          >
            <p className="text-[14px] font-medium tracking-[-0.01em] text-ink">{e.name}</p>
            <p className="text-[11.5px] text-ink-soft">PAN {e.pan}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {e.regs.map((r) => (
                <li key={r} className="rounded-full border border-ink/25 px-2.5 py-[3px] text-[11px] text-ink">
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-ink-soft">{e.team}</p>

            <ul className="mt-3 space-y-1.5">
              {e.due.map((d) => (
                <li key={d.what} className="flex items-baseline justify-between gap-3 border-t border-hairline pt-1.5 text-[12px]">
                  <span className="flex items-center gap-2 text-ink">
                    <span className={`h-2 w-2 shrink-0 rounded-[2px] ${DOT[d.state]}`} aria-hidden />
                    {d.what}
                  </span>
                  <span className={`shrink-0 ${d.state === 'late' ? 'font-medium text-ink' : 'text-ink-soft'}`}>{d.when}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-hairline pt-2 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Papers</dt>
                <dd className="text-right text-ink">{e.papers}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Fees</dt>
                <dd className="text-right text-ink">{e.fee}</dd>
              </div>
            </dl>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
