'use client';

import { useMemo, useState } from 'react';
// The GSTIN check file alone, not the whole tax engine: keeps this page (and pages that prefetch it) light.
import { calculateGstinChecksum, validateGstin } from '@synextax/tax-engine/dist/validators/gstin.js';
import { LogoMark } from '../landing/primitives';

/**
 * Paste a few client rows and see them checked the way the client import checks them: the GSTIN
 * is cleaned of spaces and case, its check character is verified, and the PAN inside it must
 * match the PAN column. Runs in the browser; nothing is sent anywhere.
 */
const gstin = (state: string, pan: string) => {
  const head = `${state}${pan}1Z`;
  return head + (calculateGstinChecksum(head) ?? '0');
};

const SAMPLE = [
  `Kaler Weaving Works, ${gstin('03', 'AAACK9988D')}, AAACK9988D`,
  `Batala Steel Works, ${gstin('03', 'AABFB1332L').toLowerCase().replace(/^(..)(.....)/, '$1 $2 ')}, AABFB1332L`,
  `Sharma Traders, ${gstin('03', 'ABJPS4410K').slice(0, 14)}X, ABJPS4410K`,
  `Gill Agro Foods, ${gstin('07', 'AAKFG2290D')}, AAKFG2209D`,
].join('\n');

type Verdict = { name: string; shown: string; state: 'ready' | 'cleaned' | 'fix'; note: string };

function check(line: string): Verdict | null {
  const cells = line.split(/\t|,/).map((c) => c.trim());
  if (cells.every((c) => c === '')) return null;
  const [name = '', rawGstin = '', rawPan = ''] = cells;
  const g = rawGstin.replace(/\s+/g, '').toUpperCase();
  const pan = rawPan.replace(/\s+/g, '').toUpperCase();
  if (!g) return { name, shown: '', state: 'fix', note: 'No GSTIN in this row' };
  const v = validateGstin(g);
  if (!v.isValid) {
    const m = /expected '(.)', received '(.)'/.exec(v.error ?? '');
    const note = m ? `The last character should be ${m[1]}, not ${m[2]}. Probably a typing slip.` : v.error ?? 'GSTIN is not valid';
    return { name, shown: g, state: 'fix', note };
  }
  if (pan && pan !== g.slice(2, 12)) return { name, shown: g, state: 'fix', note: `PAN ${pan} does not match the PAN inside the GSTIN` };
  if (g !== rawGstin) return { name, shown: g, state: 'cleaned', note: 'Spaces removed and capitalised' };
  return { name, shown: g, state: 'ready', note: v.stateName ? `${v.stateName} registration` : 'Ready' };
}

const LABEL = { ready: 'Ready', cleaned: 'Cleaned', fix: 'Fix this' } as const;
const DOT = { ready: 'bg-mint', cleaned: 'bg-sky', fix: 'bg-ink' } as const;

export function SheetCheck() {
  const [text, setText] = useState(SAMPLE);
  const rows = useMemo(() => text.split(/\r?\n/).map(check).filter((r): r is Verdict => r !== null).slice(0, 8), [text]);
  const toFix = rows.filter((r) => r.state === 'fix').length;

  return (
    <div className="w-full max-w-[560px] overflow-hidden rounded-[14px] bg-white shadow-[0_30px_60px_-30px_rgba(20,40,80,0.35)] ring-1 ring-black/[0.06]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:px-5">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
          <LogoMark size={16} /> Client import
        </p>
        <p className="text-[11px] text-ink-soft">Name, GSTIN, PAN</p>
      </div>
      <label className="block border-b border-hairline px-4 py-3 sm:px-5">
        <span className="sr-only">Client rows, one per line: name, GSTIN, PAN</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full resize-none bg-transparent font-mono text-[11.5px] leading-[1.7] text-ink focus:outline-none"
        />
      </label>
      <ul aria-live="polite" className="divide-y divide-hairline">
        {rows.map((r, i) => (
          <li key={`${i}-${r.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-ink">{r.name || 'Unnamed row'}</p>
              <p className="text-[11.5px] leading-[1.45] text-ink-soft">{r.note}</p>
            </div>
            <span className="flex items-center gap-1.5 pt-0.5 text-[11.5px] text-ink">
              <span className={`h-2 w-2 rounded-[2px] ${DOT[r.state]}`} aria-hidden />
              {LABEL[r.state]}
            </span>
          </li>
        ))}
      </ul>
      <div className={`px-4 py-3 text-[12.5px] sm:px-5 ${toFix ? 'bg-ink text-white' : 'bg-mint text-ink'}`}>
        {rows.length === 0
          ? 'Paste a row or two to check them.'
          : toFix
            ? `${toFix} of ${rows.length} rows need fixing. Nothing is saved until every row is clean.`
            : `All ${rows.length} rows are ready to import.`}
      </div>
    </div>
  );
}
