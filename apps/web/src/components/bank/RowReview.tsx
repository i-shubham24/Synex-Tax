'use client';

import React, { useState } from 'react';
import { ScanText } from 'lucide-react';
import { maskNarration, restoreMasked } from '@synextax/tax-engine';

/** Words read with less confidence than this are marked for checking. */
export const LOW_CONFIDENCE = 75;

/**
 * The rows as read from the file, editable before import. Low-confidence OCR cells are marked;
 * the row where the balance first stops adding up is marked too. Long digit runs stay masked,
 * and an edit that leaves the masked part alone keeps the hidden digits.
 */
export function RowReview(props: {
  rows: string[][];
  header: string[];
  /** Index in `rows` of the first body row. */
  start: number;
  conf?: Array<Array<number | null>>;
  pages?: number[];
  breakRow: number | null;
  onEdit: (row: number, col: number, value: string) => void;
}) {
  const { rows, header, start, conf, pages, breakRow } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const width = Math.max(header.length, ...rows.map((r) => r.length));
  const body = rows.slice(start);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-pos-ink/55">
          <tr>
            <th className="px-2 py-2 text-left font-medium">Row</th>
            {Array.from({ length: width }, (_, i) => <th key={i} className="px-2 py-2 text-left font-medium whitespace-nowrap">{header[i] || `Column ${i + 1}`}</th>)}
          </tr>
        </thead>
        <tbody>{body.map((row, k) => {
          const r = start + k;
          const isBreak = breakRow === r;
          return (
            <tr key={r} className={`border-t border-pos-line ${isBreak ? 'bg-pos-red/5' : ''}`}>
              <td className="px-2 py-1 align-top font-mono text-[11px] text-pos-ink/50 whitespace-nowrap">{r + 1}{pages?.[r] ? ` p${pages[r]}` : ''}</td>
              {Array.from({ length: width }, (_, c) => {
                const raw = row[c] ?? '';
                const cf = conf?.[r]?.[c] ?? null;
                const low = cf !== null && cf < LOW_CONFIDENCE;
                const key = `${r}:${c}`;
                const shown = maskNarration(raw);
                return (
                  <td key={c} className="px-1 py-1 align-top">
                    {editing === key ? (
                      <input autoFocus defaultValue={shown} aria-label={`Row ${r + 1}, ${header[c] || `column ${c + 1}`}`}
                        onBlur={(e) => { const v = e.target.value; if (v !== shown) props.onEdit(r, c, restoreMasked(raw, v)); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
                        className="h-7 w-full min-w-[90px] rounded-[6px] border border-pos-accent bg-pos-surface px-1.5 font-mono text-[11px] text-pos-ink outline-none" />
                    ) : (
                      <button type="button" onClick={() => setEditing(key)} title={low ? `Read with ${cf}% confidence; click to correct` : 'Click to correct'}
                        className={`block min-h-[28px] w-full min-w-[60px] max-w-[260px] rounded-[6px] px-1.5 py-1 text-left font-mono text-[11px] text-pos-ink hover:bg-pos-tint ${low ? 'bg-[#b45309]/10 ring-1 ring-[#b45309]/40' : ''}`}>
                        {shown || <span className="text-pos-ink/25">empty</span>}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

export function OcrNotice({ confidence, pages }: { confidence: number | null; pages: number[] }) {
  return (
    <p className="flex items-start gap-2 rounded-[10px] border border-[#b45309]/30 bg-[#b45309]/5 px-4 py-2 text-[13px] text-[#b45309]">
      <ScanText className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {pages.length === 1 ? `Page ${pages[0]} was a scan` : `Pages ${pages.join(', ')} were scans`} and {pages.length === 1 ? 'was' : 'were'} read by text recognition{confidence !== null ? ` (average confidence ${confidence}%)` : ''}.
        Scanned statements need checking: compare the rows below with the paper, correct any cell that is wrong (marked cells were hard to read), and make sure the balance runs through before you export.
      </span>
    </p>
  );
}
