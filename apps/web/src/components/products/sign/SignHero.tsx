'use client';

import { BadgeCheck, KeyRound, ShieldCheck, Usb } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { LogoMark, PixelField } from '../../landing/primitives';
import { SuiteHero } from '../ProductSections';

/** The office token register: whose token, and how long it has left (dsc_inventory.valid_to). */
const TOKENS = [
  { who: 'Batala Steel Works', left: '9 days', soon: true },
  { who: 'Kaler Weaving Works', left: '41 days', soon: false },
  { who: 'CA Amrinder Verma', left: '16 months', soon: false },
];

export function TokensCard() {
  return (
    <div className="w-full max-w-[280px] rounded-[12px] bg-white p-4 shadow-[0_24px_50px_-24px_rgba(20,40,80,0.45)] ring-1 ring-black/[0.06]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink">
        <LogoMark size={14} /> Tokens kept in the office
      </p>
      <ul className="mt-3 space-y-2">
        {TOKENS.map((t) => (
          <li key={t.who} className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2 text-[12px]">
            <span className="truncate text-ink">{t.who}</span>
            <span className={`shrink-0 tabular-nums ${t.soon ? 'rounded-[3px] bg-ink px-1.5 text-white' : 'text-ink-soft'}`}>{t.left}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who does what in one signature, from the token up to the root that vouches for it. */
const CHAIN = [
  { icon: Usb, title: 'Your token', note: 'Holds the private key. It never leaves.', tone: 'bg-ink text-white', sub: 'text-white/65' },
  { icon: KeyRound, title: 'Its driver', note: 'Asks for the PIN in its own window.', tone: 'bg-sky text-white', sub: 'text-white/80' },
  { icon: ShieldCheck, title: 'SynTax', note: 'Checks the signature against the return.', tone: 'bg-mint-pale text-ink', sub: 'text-ink/70' },
  { icon: BadgeCheck, title: 'CCA India root', note: 'Vouches for the certificate.', tone: 'bg-mint text-ink', sub: 'text-ink/70' },
];

function TrustChain() {
  const reduce = useReducedMotion();
  return (
    <div className="w-full">
      {/* Wide screens: a staircase climbing to the root */}
      <div className="relative hidden h-[520px] w-full sm:block">
        {CHAIN.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.title}
              className={`pixel-host absolute flex h-[136px] w-[46%] flex-col overflow-hidden rounded-[10px] p-5 ${c.tone}`}
              style={{ left: `${i * 18}%`, top: `${(3 - i) * 26 + 2}%` }}
              initial={reduce ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {i === 3 && <PixelField seed={71} count={26} cell={13} cols={16} rows={10} color="#c9f9d8" maxOpacity={0.75} />}
              <Icon className="relative h-5 w-5" strokeWidth={2} />
              <p className="relative mt-auto text-[19px] font-medium tracking-[-0.03em]">{c.title}</p>
              <p className={`relative mt-1 text-[12.5px] leading-[1.4] ${c.sub}`}>{c.note}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Phones: the same chain, one under another */}
      <ol className="grid gap-2 sm:hidden">
        {CHAIN.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.title} className={`flex items-start gap-3 rounded-[10px] p-4 ${c.tone}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
              <div>
                <p className="text-[16px] font-medium tracking-[-0.02em]">{c.title}</p>
                <p className={`text-[12.5px] ${c.sub}`}>{c.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SignHero() {
  return (
    <SuiteHero
      suite="SynTax Sign"
      titleId="sign-title"
      title={<>Sign with your USB token, not with&nbsp;Java.</>}
      body={
        <p>
          A small SynTax app on the office PC signs what a partner has approved, with the Class 3 certificate already on your
          token. SynTax never sees the PIN.
        </p>
      }
      price="Included with GST and TDS plans"
      visual={<TrustChain />}
      footer={<p>Works on Windows with ePass2003, ProxKey, mToken and eToken drivers.</p>}
    />
  );
}
