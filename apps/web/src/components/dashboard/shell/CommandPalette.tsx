'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Building2, CornerDownLeft, FileUp, LayoutDashboard, Percent, ReceiptText, Search, Settings, Zap } from 'lucide-react';
import { useWorkspace } from '../../../workspace/WorkspaceContext';

type Item = {
  id: string;
  group: 'Actions' | 'Clients' | 'Go to';
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  run: () => void;
};

/** Global Cmd+K / Ctrl+K bar: fuzzy search over clients and identifiers, plus "> action" commands. */
export function CommandPalette() {
  const router = useRouter();
  const { snapshot, setActiveClient } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('synextax:command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('synextax:command', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQ('');
      setCursor(0);
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'a-3b', group: 'Actions', label: 'File GSTR-3B', hint: '> file 3b', icon: Zap, keywords: 'file 3b gstr-3b offset liability', run: () => go('/gst') },
      { id: 'a-1', group: 'Actions', label: 'Prepare GSTR-1', hint: '> file 1', icon: ReceiptText, keywords: 'file 1 gstr-1 sales outward', run: () => go('/gst') },
      { id: 'a-recon', group: 'Actions', label: 'Run 2B reconciliation', hint: '> recon', icon: ReceiptText, keywords: 'recon 2b reconcile ims purchase', run: () => go('/gst/recon-2b') },
      { id: 'a-tally', group: 'Actions', label: 'Import from Tally or Excel', hint: '> import tally', icon: FileUp, keywords: 'import tally excel csv upload busy marg', run: () => go('/clients') },
      { id: 'a-challan', group: 'Actions', label: 'Log a TDS challan (ITNS 281N)', hint: '> challan', icon: Percent, keywords: 'challan 281n tds deposit bsr cin', run: () => go('/tds') },
      { id: 'a-matrix', group: 'Actions', label: 'Open filing matrix', hint: '> matrix', icon: LayoutDashboard, keywords: 'matrix filing status approvals workload', run: () => go('/dashboard?view=matrix') },
    ];
    const nav: Item[] = [
      { id: 'n-ct', group: 'Go to', label: 'Control Tower', icon: LayoutDashboard, keywords: 'dashboard control tower home', run: () => go('/dashboard') },
      { id: 'n-cl', group: 'Go to', label: 'Client Master', icon: Building2, keywords: 'clients master entities', run: () => go('/clients') },
      { id: 'n-tds', group: 'Go to', label: 'Dual-Act TDS', icon: Percent, keywords: 'tds tcs 138 140 143 144 fvu traces', run: () => go('/tds') },
      { id: 'n-set', group: 'Go to', label: 'Settings', icon: Settings, keywords: 'settings team rbac mfa billing', run: () => go('/settings') },
    ];
    const clients: Item[] = snapshot.entities.flatMap((e) => [
      {
        id: `c-${e.id}`,
        group: 'Clients' as const,
        label: e.legalName,
        hint: e.pan,
        icon: Building2,
        keywords: `${e.legalName} ${e.pan} ${e.gstins.map((g) => g.gstin).join(' ')} ${e.tans.map((t) => t.tan).join(' ')}`.toLowerCase(),
        run: () => {
          setActiveClient({ entityId: e.id, gstin: e.gstins[0]?.gstin, tan: e.gstins[0] ? undefined : e.tans[0]?.tan });
          go('/clients');
        },
      },
    ]);
    return [...actions, ...clients, ...nav];
  }, [snapshot.entities, go, setActiveClient]);

  const filtered = useMemo(() => {
    const raw = q.trim().toLowerCase();
    const isAction = raw.startsWith('>');
    const needle = raw.replace(/^>\s*/, '');
    const pool = isAction ? items.filter((i) => i.group === 'Actions') : items;
    if (!needle) return pool.slice(0, 12);
    const terms = needle.split(/\s+/);
    return pool.filter((i) => terms.every((t) => `${i.label.toLowerCase()} ${i.keywords}`.includes(t))).slice(0, 12);
  }, [q, items]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[cursor]?.run();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let lastGroup = '';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command bar"
            initial={{ y: -10, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="w-full max-w-[620px] overflow-hidden rounded-[22px] bg-pos-surface text-pos-ink shadow-[0_0_0_1px_rgb(var(--pos-line)),0_40px_80px_-30px_rgba(10,20,40,0.5)]"
          >
            <div className="flex items-center gap-3 border-b border-pos-line px-5">
              <Search className="h-[18px] w-[18px] text-pos-ink/60" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search clients, GSTIN, PAN, TAN, or type > for actions"
                aria-label="Command"
                aria-activedescendant={filtered[cursor] ? `cmd-${filtered[cursor].id}` : undefined}
                className="h-14 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-pos-ink/40"
              />
              <kbd className="rounded-md border border-pos-line px-1.5 py-0.5 text-[12px] text-pos-ink/60">Esc</kbd>
            </div>
            <ul ref={listRef} role="listbox" className="max-h-[400px] overflow-y-auto p-2">
              {filtered.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    {header && <p className="px-3 pb-1 pt-2.5 text-[12.5px] font-medium text-pos-ink/60">{header}</p>}
                    <button
                      id={`cmd-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === cursor}
                      data-index={i}
                      onMouseEnter={() => setCursor(i)}
                      onClick={item.run}
                      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] ${i === cursor ? 'bg-pos-tint' : ''}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${i === cursor ? 'bg-pos-accent text-white' : 'bg-pos-muted text-pos-ink/60'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="ident font-mono text-[12.5px] text-pos-ink/60">{item.hint}</span>}
                      {i === cursor && <CornerDownLeft className="h-3.5 w-3.5 text-pos-ink/60" />}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="flex items-center justify-center gap-2 px-3 py-10 text-[13.5px] text-pos-ink/55">
                  No match. Try a GSTIN, PAN or <span className="ident font-mono">&gt; file 3b</span> <ArrowRight className="h-3.5 w-3.5" />
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Opens the palette from anywhere (e.g. the header search pill). */
export function openCommandPalette() {
  window.dispatchEvent(new Event('synextax:command'));
}
