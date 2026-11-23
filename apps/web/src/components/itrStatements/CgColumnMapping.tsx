'use client';

import React from 'react';
import { Columns3 } from 'lucide-react';
import { CG_ROLES, CG_SOURCE_NAMES, type CgRole, type CgSource } from '@synextax/tax-engine';

const select = 'h-8 rounded-[8px] border border-pos-line bg-pos-surface px-2 text-[12px] text-pos-ink outline-none focus:border-pos-accent';

/**
 * Column mapping for a capital gains report whose layout was not recognised: one choice per
 * column, with the heading and two sample rows. Like the bank page's mapping step.
 */
export function CgColumnMapping(props: {
  header: string[];
  samples: string[][];
  roles: CgRole[];
  source: CgSource;
  headerRow: number;
  rowCount: number;
  missing: string[];
  onRoles: (roles: CgRole[]) => void;
  onHeaderRow: (row: number) => void;
  onReset: () => void;
}) {
  const { header, samples, roles, missing } = props;
  const width = Math.max(header.length, roles.length, ...samples.map((s) => s.length), 1);
  return (
    <section className="space-y-3 rounded-[12px] border border-pos-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-pos-ink"><Columns3 className="h-4 w-4" /> Check the columns</h4>
          <p className="mt-1 text-[12px] text-pos-ink/60">Report: {CG_SOURCE_NAMES[props.source]}. {missing.length ? `Still needed: ${missing.join(', ')}.` : 'All needed columns are chosen.'}</p>
        </div>
        <div className="flex items-end gap-2 text-[12px] text-pos-ink/60">
          <label className="flex flex-col gap-1">Heading row
            <input type="number" min={1} max={props.rowCount} value={props.headerRow + 1} onChange={(e) => props.onHeaderRow(Math.max(0, Math.min(props.rowCount - 1, Number(e.target.value) - 1)))} className={`${select} w-20 font-mono`} />
          </label>
          <button type="button" onClick={props.onReset} className="h-8 rounded-full border border-pos-line px-3 text-[12px] text-pos-ink">Use detected columns</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>{Array.from({ length: width }, (_, i) => (
              <th key={i} className="px-2 pb-2 text-left align-bottom font-normal">
                <span className="mb-1 block max-w-[160px] truncate text-pos-ink/60" title={header[i] ?? ''}>{header[i] || `Column ${i + 1}`}</span>
                <select aria-label={`Column ${i + 1} holds`} value={roles[i] ?? 'ignore'} className={select}
                  onChange={(e) => { const next = Array.from({ length: width }, (_, k) => roles[k] ?? 'ignore'); next[i] = e.target.value as CgRole; props.onRoles(next); }}>
                  {CG_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
              </th>
            ))}</tr>
          </thead>
          <tbody>{samples.map((row, r) => (
            <tr key={r} className="border-t border-pos-line">{Array.from({ length: width }, (_, i) => (
              <td key={i} className="max-w-[180px] truncate px-2 py-1.5 text-[12px] text-pos-ink/75">{row[i] ?? ''}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
