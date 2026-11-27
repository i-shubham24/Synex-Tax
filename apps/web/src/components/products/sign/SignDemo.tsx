'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, KeyRound, Usb, X } from 'lucide-react';
import { LogoMark } from '../../landing/primitives';

/**
 * One signature through the real flow (apps/dsc-agent, apps/api/src/routes/dsc.routes.ts):
 * the server names a digest in a signed challenge, the agent finds the certificate, the token's
 * own driver asks for the PIN, and the server checks the chain before logging it.
 */
type Stage = 'idle' | 'pin' | 'checking' | 'done' | 'cancelled';

const STEPS = [
  { key: 'challenge', label: 'SynTax prepares the return and a one-time request, valid for two minutes' },
  { key: 'token', label: 'The app on this PC finds the certificate on the token' },
  { key: 'pin', label: 'The token’s own driver asks for the PIN' },
  { key: 'check', label: 'The signature and its chain to the CCA India root are checked' },
];

function stepState(stage: Stage, i: number): 'done' | 'now' | 'todo' | 'stopped' {
  const reached = { idle: -1, pin: 2, checking: 3, done: 4, cancelled: 2 }[stage];
  if (stage === 'cancelled' && i === 2) return 'stopped';
  if (i < reached) return 'done';
  if (i === reached) return 'now';
  return 'todo';
}

export function SignDemo() {
  const [stage, setStage] = useState<Stage>('idle');
  const reduce = useReducedMotion();

  useEffect(() => {
    if (stage !== 'checking') return;
    const t = setTimeout(() => setStage('done'), reduce ? 0 : 1100);
    return () => clearTimeout(t);
  }, [stage, reduce]);

  return (
    <div className="relative w-full max-w-[520px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3.5 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <LogoMark size={16} /> GSTR-3B, October 2026
        </p>
        <p className="text-[11px] text-ink-soft">Approved by the partner</p>
      </div>

      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-sky/15 text-sky-deep">
          <Usb className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-[12.5px]">
          <p className="font-medium text-ink">CA Amrinder Verma, Class 3</p>
          <p className="text-ink-soft">ePass2003 token, valid to 31 Mar 2028</p>
        </div>
      </div>

      <ol className="list-none space-y-2.5 px-4 py-4 sm:px-5">
        {STEPS.map((s, i) => {
          const st = stepState(stage, i);
          return (
            <li key={s.key} className="flex items-start gap-3 text-[12.5px] leading-[1.45]">
              <span
                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  st === 'done' ? 'bg-mint text-ink' : st === 'now' ? 'bg-ink text-white' : st === 'stopped' ? 'bg-ink text-white' : 'border border-ink/20 text-ink-soft'
                }`}
                aria-hidden
              >
                {st === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : st === 'stopped' ? <X className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={st === 'todo' ? 'text-ink-soft' : 'text-ink'}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div aria-live="polite">
        {stage === 'idle' && (
          <div className="border-t border-hairline px-4 py-3.5 sm:px-5">
            <button
              type="button"
              onClick={() => setStage('pin')}
              className="w-full rounded-full bg-ink py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2"
            >
              Sign with this token
            </button>
          </div>
        )}
        {stage === 'done' && (
          <div className="bg-mint px-4 py-3.5 sm:px-5">
            <p className="text-[14px] font-medium tracking-[-0.01em] text-ink">Signed and checked</p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-ink/75">
              Recorded in the audit trail with the certificate, the time and who approved it.{' '}
              <button type="button" onClick={() => setStage('idle')} className="underline underline-offset-2">
                Start again
              </button>
            </p>
          </div>
        )}
        {stage === 'cancelled' && (
          <div className="bg-ink px-4 py-3.5 text-white sm:px-5">
            <p className="text-[14px] font-medium tracking-[-0.01em]">Cancelled on this computer</p>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-white/75">
              Nothing was signed, and the cancel is logged too.{' '}
              <button type="button" onClick={() => setStage('idle')} className="underline underline-offset-2">
                Try again
              </button>
            </p>
          </div>
        )}
        {stage === 'checking' && (
          <div className="border-t border-hairline px-4 py-3.5 text-[12.5px] text-ink-soft sm:px-5">Checking the signature&hellip;</div>
        )}
      </div>

      {/* The token driver's window, drawn plainly so it reads as Windows, not as SynTax */}
      <AnimatePresence>
        {stage === 'pin' && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-ink/25 p-5"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-label="Token driver PIN window"
              className="w-full max-w-[300px] border border-[#8a8a8a] bg-[#f3f3f3] font-sans shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]"
              initial={reduce ? false : { scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
            >
              <div className="flex items-center gap-2 bg-white px-3 py-2 text-[11.5px] text-[#1a1a1a]">
                <KeyRound className="h-3.5 w-3.5" /> ePass2003 User PIN
              </div>
              <div className="px-3 pb-3 pt-2.5 text-[11.5px] text-[#1a1a1a]">
                <p>Enter the user PIN for this token.</p>
                <div className="mt-2 border border-[#7a7a7a] bg-white px-2 py-1 tracking-[0.3em]">&bull;&bull;&bull;&bull;&bull;&bull;</div>
                <p className="mt-2 text-[10.5px] leading-[1.45] text-[#555]">This window belongs to the token driver. SynTax never sees the PIN.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setStage('checking')}
                    className="min-w-[64px] border border-[#0067c0] bg-[#0067c0] px-2 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0067c0]"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage('cancelled')}
                    className="min-w-[64px] border border-[#8a8a8a] bg-[#fdfdfd] px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0067c0]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
