'use client';

import React from 'react';
import { Columns3 } from 'lucide-react';
import { BANK_LAYOUTS, COLUMN_ROLES, maskNarration, type BankId, type ColumnRole } from '@synextax/tax-engine';

const select = 'h-8 rounded-[8px] border border-pos-line bg-pos-surface px-2 text-[12px] text-pos-ink outline-none focus:border-pos-accent';

/**
 * The column-mapping step: one choice per column, with the heading and two sample entries shown
 * (masked). Changes are remembered for the chosen bank in this browser.
 */
export function ColumnMapping(props: {
  header: string[];
  samples: string[][];
  roles: ColumnRole[];
  bank: BankId;
  reasons: string[];
  onRoles: (roles: ColumnRole[]) => void;
  onBank: (bank: BankId) => void;
  onReset: () => void;
}) {
  const { header, samples, roles, bank, reasons } = props;
  const width = Math.max(header.length, roles.length, ...samples.map((s) => s.length));
  return (
    <section className="pos-card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-pos-ink"><Columns3 className="h-4 w-4" /> Check the columns</h2>
          {reasons.length > 0 && <ul className="mt-1 text-[12px] text-pos-ink/60">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <p className="mt-1 text-[12px] text-pos-ink/55">Your choices are remembered for this bank in this browser only.</p>
        </div>
        <div className="flex items-end gap-2 text-[12px] text-pos-ink/60">
          <label className="flex flex-col gap-1">Bank
            <select value={bank} onChange={(e) => props.onBank(e.target.value as BankId)} className={select}>
              {BANK_LAYOUTS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="GENERIC">Other bank</option>
            </select>
          </label>
          <button type="button" onClick={props.onReset} className="h-8 rounded-full border border-pos-line px-3 text-[12px] text-pos-ink">Use detected columns</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr>{Array.from({ length: width }, (_, i) => (
              <th key={i} className="px-2 pb-2 text-left align-bottom font-normal">
                <span className="mb-1 block max-w-[160px] truncate text-pos-ink/55" title={header[i] ?? ''}>{header[i] || `Column ${i + 1}`}</span>
                <select aria-label={`Column ${i + 1} holds`} value={roles[i] ?? 'ignore'} className={select}
                  onChange={(e) => { const next = Array.from({ length: width }, (_, k) => roles[k] ?? 'ignore'); next[i] = e.target.value as ColumnRole; props.onRoles(next); }}>
                  {COLUMN_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                </select>
              </th>
            ))}</tr>
          </thead>
          <tbody>{samples.map((row, r) => (
            <tr key={r} className="border-t border-pos-line">{Array.from({ length: width }, (_, i) => (
              <td key={i} className="max-w-[180px] truncate px-2 py-1.5 font-mono text-[11px] text-pos-ink/75">{maskNarration(row[i] ?? '')}</td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
