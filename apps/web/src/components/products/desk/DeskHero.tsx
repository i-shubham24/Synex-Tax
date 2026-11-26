'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark, PixelField } from '../../landing/primitives';
import { SuiteHero } from '../ProductSections';

/** A few lines of the audit trail, as a partner reads it. Sample entries. */
const LOG = [
  { who: 'Rohan, staff', what: 'imported the November purchase register', at: '10:42' },
  { who: 'Amrinder, partner', what: 'revealed a PAN, reason: TRACES login', at: '11:05' },
  { who: 'Meena, manager', what: 'approved GSTR-3B for Batala Steel Works', at: '12:18' },
];

export function TrailCard() {
  return (
    <div className="w-[290px] rounded-[12px] bg-white p-4 shadow-[0_24px_50px_-24px_rgba(20,40,80,0.45)] ring-1 ring-black/[0.06]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
        <LogoMark size={14} /> Audit trail, today
      </p>
      <ul className="mt-3 space-y-2">
        {LOG.map((l) => (
          <li key={l.at} className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-hairline pt-2 text-[11.5px] leading-[1.4]">
            <span className="text-ink">
              <span className="font-medium">{l.who}</span> {l.what}
            </span>
            <span className="tabular-nums text-ink-soft">{l.at}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-2 text-[11px] text-ink">
        <span className="h-2 w-2 rounded-[2px] bg-mint" aria-hidden /> Chain checked, nothing altered
      </p>
    </div>
  );
}

/** The client master as four tiers, each sitting under the one above. Sample firm. */
const TIERS = [
  { label: 'Your firm', title: 'Verma & Associates', note: '12 people, one login each', tone: 'bg-ink text-white', sub: 'text-white/60' },
  { label: 'Group', title: 'Kaler group', note: '2 businesses, one family', tone: 'bg-sky text-white', sub: 'text-white/75' },
  { label: 'Client, by PAN', title: 'Kaler Weaving Works', note: 'PAN XXXXX4821K', tone: 'bg-white text-ink ring-1 ring-ink/10', sub: 'text-ink-soft' },
];
const REGS = ['GSTIN 03, Punjab', 'GSTIN 07, Delhi', 'TAN, Amritsar'];
/** Each tier sits a step in from the one above; a smaller step on phones. */
const INDENT = ['ml-0', 'ml-[5%] sm:ml-[11%]', 'ml-[10%] sm:ml-[22%]', 'ml-[15%] sm:ml-[33%]'];

function ClientTree() {
  const reduce = useReducedMotion();
  const rise = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="w-full py-6 lg:py-0">
      <ol className="relative space-y-3">
        {TIERS.map((t, i) => (
          <motion.li key={t.label} {...rise(i)} className={`relative ${INDENT[i]}`}>
            {/* Connector from the tier above */}
            {i > 0 && <span aria-hidden className="absolute -top-3 left-[-5.5%] hidden h-[calc(50%+12px)] w-[5.5%] rounded-bl-[8px] border-b border-l border-ink/25 sm:block" />}
            <div className={`flex flex-col gap-1 rounded-[10px] px-5 py-4 ${t.tone}`}>
              <div className="min-w-0">
                <p className={`text-[11.5px] ${t.sub}`}>{t.label}</p>
                <p className="mt-0.5 text-[19px] font-medium tracking-[-0.03em]">{t.title}</p>
              </div>
              <p className={`text-[12px] ${t.sub}`}>{t.note}</p>
            </div>
          </motion.li>
        ))}
        <motion.li {...rise(3)} className={`relative ${INDENT[3]}`}>
          <span aria-hidden className="absolute -top-3 left-[-5.5%] hidden h-[calc(50%+12px)] w-[5.5%] rounded-bl-[8px] border-b border-l border-ink/25 sm:block" />
          <div className="pixel-host relative overflow-hidden rounded-[10px] bg-mint px-5 py-4 text-ink">
            <PixelField seed={83} count={22} cell={12} cols={18} rows={7} color="#c9f9d8" maxOpacity={0.75} />
            <p className="relative text-[11.5px] text-ink/70">Registrations</p>
            <ul className="relative mt-2 flex flex-wrap gap-1.5">
              {REGS.map((r) => (
                <li key={r} className="rounded-full border border-ink/40 px-2.5 py-[3px] text-[12px]">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </motion.li>
      </ol>
    </div>
  );
}

export function DeskHero() {
  return (
    <SuiteHero
      suite="SynTax Desk"
      titleId="desk-title"
      title={<>Every client, every return, one&nbsp;list.</>}
      body={
        <p>
          Add a client once by PAN, with their GSTINs and TANs. Papers, fees, team access and the audit trail hang off that same
          record.
        </p>
      }
      price="Included in every plan"
      visual={<ClientTree />}
      footer={<p>Moving from SmartBiz or a spreadsheet? Import your client list and TDS files as they are.</p>}
    />
  );
}
