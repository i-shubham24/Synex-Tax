'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

/** "g" then a letter jumps to a screen; "?" lists them. Ignored while typing in a field. */
export const GO_TO: Array<[string, string, string]> = [
  ['d', '/dashboard', 'Control Tower'],
  ['c', '/clients', 'Client Master'],
  ['i', '/clients/import', 'Import clients'],
  ['g', '/gst', 'GST and IMS'],
  ['r', '/gst/recon-2b', '2B reconciliation'],
  ['t', '/tds', 'Dual-Act TDS'],
  ['h', '/tds/health', 'TDS health and past statements'],
  ['o', '/documents', 'Client documents'],
  ['e', '/gst/returns', 'GST returns'],
  ['p', '/practice', 'Practice'],
  ['b', '/bank', 'Bank to books'],
  ['x', '/itr', 'Income tax'],
  ['a', '/audit', 'Audit and reports'],
  ['s', '/settings', 'Settings'],
];

/** Function keys, Tally style. F1, F5, F11 and F12 stay with the browser. */
export const F_KEYS: Array<[string, string, string]> = [
  ['F2', '/gst/returns', 'GST returns'],
  ['F3', '/tds/health', 'TDS statements and registers'],
  ['F4', '/practice', 'Practice: tasks and fees'],
  ['F6', '/bank', 'Bank to books'],
  ['F7', '/itr', 'Income tax'],
  ['F8', '/documents', 'Client documents'],
  ['F9', '/clients', 'Client Master'],
  ['F10', '/dashboard', 'Control Tower'],
];

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const fk = F_KEYS.find(([k]) => k === e.key);
      if (fk) {
        e.preventDefault();
        setOpen(false);
        router.push(fk[1]);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const hit = GO_TO.find(([k]) => k === e.key.toLowerCase());
        if (hit) {
          e.preventDefault();
          setOpen(false);
          router.push(hit[1]);
        }
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, 1200);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="kbd-title" className="pos-card max-h-[85vh] w-full max-w-md overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="kbd-title" className="text-[16px] font-semibold text-pos-ink">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded-full p-1 text-pos-ink/60 hover:bg-pos-muted"><X className="h-4 w-4" /></button>
        </div>
        <dl className="mt-4 space-y-2 text-[13.5px]">
          <div className="flex justify-between"><dt className="text-pos-ink/70">Search or run a command</dt><dd><kbd className="rounded border border-pos-line px-1.5 text-[12px]">Ctrl K</kbd></dd></div>
          {GO_TO.map(([k, , label]) => (
            <div key={k} className="flex justify-between"><dt className="text-pos-ink/70">{label}</dt><dd><kbd className="rounded border border-pos-line px-1.5 text-[12px]">g</kbd> <kbd className="rounded border border-pos-line px-1.5 text-[12px]">{k}</kbd></dd></div>
          ))}
          {F_KEYS.map(([k, , label]) => (
            <div key={k} className="flex justify-between"><dt className="text-pos-ink/70">{label}</dt><dd><kbd className="rounded border border-pos-line px-1.5 text-[12px]">{k}</kbd></dd></div>
          ))}
          <div className="flex justify-between"><dt className="text-pos-ink/70">Show this list</dt><dd><kbd className="rounded border border-pos-line px-1.5 text-[12px]">?</kbd></dd></div>
        </dl>
      </div>
    </div>
  );
}
