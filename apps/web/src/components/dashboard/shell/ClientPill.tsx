'use client';

import { useMemo, useState } from 'react';
import { maskPan } from '@synextax/tax-engine';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, ChevronDown, Search, X } from 'lucide-react';
import { useWorkspace } from '../../../workspace/WorkspaceContext';
import { panelClass, usePopover } from './usePopover';

/**
 * Active client context pill. Once a client is pinned it stays visible across GST, TDS and DSC
 * screens, so staff never prepare data under the wrong GSTIN.
 */
export function ClientPill() {
  const { snapshot, activeEntity, activeClient, setActiveClient } = useWorkspace();
  const pop = usePopover();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return snapshot.entities.filter(
      (e) =>
        !needle ||
        e.legalName.toLowerCase().includes(needle) ||
        e.pan.toLowerCase().includes(needle) ||
        e.gstins.some((g) => g.gstin.toLowerCase().includes(needle)) ||
        e.tans.some((t) => t.tan.toLowerCase().includes(needle)),
    );
  }, [q, snapshot.entities]);

  const id = activeClient?.gstin ?? activeClient?.tan ?? activeEntity?.pan;

  return (
    <div ref={pop.ref} className="relative min-w-0 max-w-[360px]">
      <div
        className={`flex h-10 min-w-0 items-center gap-2 rounded-full border pl-3 pr-1.5 text-[13px] transition-colors ${
          activeEntity ? 'border-pos-accent/40 bg-pos-tint text-pos-ink' : 'border-dashed border-pos-line text-pos-ink/60'
        }`}
      >
        <button
          type="button"
          onClick={() => pop.setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={pop.open}
          className="flex min-w-0 items-center gap-2 whitespace-nowrap"
        >
          <Building2 className={`h-4 w-4 shrink-0 ${activeEntity ? 'text-pos-accent' : ''}`} />
          {activeEntity ? (
            <span className="min-w-0 truncate">
              <span className="font-medium">{activeEntity.legalName}</span>
              <span className="ident ml-1.5 font-mono text-[12.5px] text-pos-ink/55">{id}</span>
            </span>
          ) : (
            <span>Select a client</span>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
        {activeEntity && (
          <button
            type="button"
            onClick={() => setActiveClient(null)}
            aria-label="Clear active client"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-pos-ink/60 hover:bg-pos-surface hover:text-pos-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {pop.open && (
          <motion.div
            role="dialog"
            aria-label="Choose active client"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`${panelClass} left-0 w-[420px]`}
          >
            <div className="relative border-b border-pos-line p-3">
              <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-pos-ink/60" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Client, PAN, GSTIN or TAN"
                aria-label="Search clients"
                className="h-10 w-full rounded-full border border-pos-line bg-pos-muted pl-10 pr-4 text-[13.5px] text-pos-ink outline-none focus:border-pos-accent"
              />
            </div>
            <ul className="max-h-[340px] overflow-y-auto p-1.5">
              {results.map((e) => (
                <li key={e.id} className="rounded-[14px] px-2.5 py-2 hover:bg-pos-muted">
                  <p className="text-[13.5px] font-medium text-pos-ink">{e.legalName}</p>
                  <p className="ident text-[12px] text-pos-ink/60">PAN {maskPan(e.pan)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.gstins.map((g) => (
                      <button
                        key={g.gstin}
                        type="button"
                        onClick={() => {
                          setActiveClient({ entityId: e.id, gstin: g.gstin });
                          pop.setOpen(false);
                        }}
                        className="ident rounded-full border border-pos-line bg-pos-surface px-2.5 py-1 font-mono text-[12px] text-pos-ink hover:border-pos-accent hover:text-pos-accent"
                      >
                        {g.gstin}
                      </button>
                    ))}
                    {e.tans.map((t) => (
                      <button
                        key={t.tan}
                        type="button"
                        onClick={() => {
                          setActiveClient({ entityId: e.id, tan: t.tan });
                          pop.setOpen(false);
                        }}
                        className="ident rounded-full border border-pos-line bg-pos-surface px-2.5 py-1 font-mono text-[12px] text-pos-ink hover:border-[#5fe88a] hover:text-pos-green"
                      >
                        TAN {t.tan}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
              {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-pos-ink/55">No client matches that search.</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
