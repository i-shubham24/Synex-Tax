'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { panelClass, usePopover } from './usePopover';

const PLANS = [
  { id: 'SOLO', name: 'Solo practitioner', price: '8,999', quota: '50 GSTINs, 25 TANs, 3 seats' },
  { id: 'GROWTH', name: 'Growth firm', price: '15,999', quota: '200 GSTINs, 100 TANs, unlimited seats' },
  { id: 'SCALE', name: 'Scale practice', price: '29,999', quota: '600 GSTINs, 300 TANs, unlimited seats' },
];

/** Trial meter for 14-day trial firms: days left and real-client slots used, with an unobtrusive activate drawer. */
export function PlanMeter() {
  const { user } = useAuth();
  const pop = usePopover();
  if (!user || user.plan !== 'TRIAL') return null;

  const days = user.trialDaysRemaining;
  const used = user.activeClientsCount;
  const max = user.maxTrialClients;
  const urgent = days <= 3;

  return (
    <div ref={pop.ref} className="relative hidden xl:block">
      <button
        type="button"
        onClick={() => pop.setOpen((o) => !o)}
        aria-expanded={pop.open}
        className={`flex h-10 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium ${
          urgent ? 'border-pos-red/40 bg-pos-red/10 text-pos-red' : 'border-pos-line bg-pos-surface/70 text-pos-ink/80'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Trial: {days} days, {used}/{max} clients
      </button>
      <AnimatePresence>
        {pop.open && (
          <motion.div
            role="dialog"
            aria-label="Activate a plan"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`${panelClass} right-0 w-[340px] p-4 text-pos-ink`}
          >
            <p className="text-[15px] font-semibold">Your trial</p>
            <p className="mt-1 text-[13px] text-pos-ink/60">
              {days} days left. {used} of {max} real clients in use; sample clients do not count.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pos-muted">
              <div className="h-full rounded-full bg-pos-accent" style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {PLANS.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-[14px] border border-pos-line px-3 py-2.5">
                  <span>
                    <span className="block text-[13.5px] font-medium">{p.name}</span>
                    <span className="block text-[11.5px] text-pos-ink/50">{p.quota}</span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">&#8377;{p.price}/yr</span>
                </li>
              ))}
            </ul>
            <Link
              href="/settings?tab=billing"
              onClick={() => pop.setOpen(false)}
              className="mt-4 flex h-10 items-center justify-center rounded-full bg-pos-head text-[13px] font-medium text-white"
            >
              Activate a plan
            </Link>
            <p className="mt-2 text-center text-[11.5px] text-pos-ink/45">Prices exclude 18% GST.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
