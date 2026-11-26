'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Usb } from 'lucide-react';
import { panelClass, usePopover } from './usePopover';

/** The Go agent listens on loopback only (apps/dsc-agent). The CSP allows exactly this origin. */
const AGENT = process.env.NEXT_PUBLIC_DSC_AGENT_URL || 'http://127.0.0.1:15850';
const POLL_MS = 15_000;

type AgentState =
  | { kind: 'checking' }
  | { kind: 'offline' }
  | { kind: 'ready'; token: string | null; version: string | null };

async function probe(): Promise<AgentState> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${AGENT}/health`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return { kind: 'offline' };
    const body = (await res.json().catch(() => ({}))) as { version?: string; token?: string; tokenLabel?: string };
    return { kind: 'ready', token: body.tokenLabel ?? body.token ?? null, version: body.version ?? null };
  } catch {
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Live loopback status of the local DSC signer. Never sends a PIN or key material: health only. */
export function DscAgentPill() {
  const [state, setState] = useState<AgentState>({ kind: 'checking' });
  const pop = usePopover();

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    setState(await probe());
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const s = await probe();
      if (alive) setState(s);
    };
    run();
    const id = window.setInterval(() => !document.hidden && run(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const ready = state.kind === 'ready';
  return (
    <div ref={pop.ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => pop.setOpen((o) => !o)}
        aria-expanded={pop.open}
        className={`flex h-10 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors ${
          ready
            ? 'border-[#5fe88a]/50 bg-[#5fe88a]/15 text-pos-ink'
            : state.kind === 'checking'
              ? 'border-pos-line bg-pos-surface/70 text-pos-ink/60'
              : 'border-[#f2b53a]/60 bg-[#f2b53a]/15 text-pos-ink'
        }`}
      >
        <Usb className={`h-4 w-4 ${ready ? 'text-[#14a44d]' : state.kind === 'offline' ? 'text-[#b9800f]' : ''}`} />
        {ready ? `DSC ready${state.token ? `: ${state.token}` : ''}` : state.kind === 'checking' ? 'Checking signer' : 'Signer offline'}
      </button>
      <AnimatePresence>
        {pop.open && (
          <motion.div
            role="dialog"
            aria-label="Local DSC signer"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`${panelClass} fixed right-3 top-16 sm:absolute sm:right-0 sm:top-[calc(100%+10px)] w-[calc(100vw-24px)] sm:w-[320px] max-w-[320px] p-4 text-[13px] text-pos-ink origin-top-right`}
          >
            <p className="text-[14.5px] font-semibold">Local DSC signer</p>
            {ready ? (
              <p className="mt-1.5 leading-[1.5] text-pos-ink/65">
                Connected on this computer{state.version ? `, version ${state.version}` : ''}. Your token PIN is entered on the token prompt only and never leaves this PC.
              </p>
            ) : (
              <p className="mt-1.5 leading-[1.5] text-pos-ink/65">
                The signer is not running on this computer. Start it from the Start menu or the tray, then retry. Signed Windows and macOS installers ship with the DSC hub.
              </p>
            )}
            <button
              type="button"
              onClick={check}
              className="mt-3 flex h-9 items-center gap-2 rounded-full bg-pos-head px-4 text-[12.5px] font-medium text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${state.kind === 'checking' ? 'animate-spin' : ''}`} /> Check again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
