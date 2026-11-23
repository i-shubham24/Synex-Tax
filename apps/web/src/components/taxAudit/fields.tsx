'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export const inputCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
export const selectCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-2 text-[13px] text-pos-ink';
export const labelCls = 'text-[12px] font-medium text-pos-ink/75';

type Obj = Record<string, unknown>;

export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Obj)[k] : undefined), o);
}

export function setPath<T>(o: T, path: string, value: unknown): T {
  const [k, ...rest] = path.split('.');
  const base = (o && typeof o === 'object' ? o : {}) as Obj;
  return { ...base, [k]: rest.length ? setPath(base[k], rest.join('.'), value) : value } as T;
}

export type Kind = 'text' | 'amount' | 'signed' | 'decimal' | 'date' | 'select' | 'bool' | 'list';
export interface Col { key: string; label: string; kind?: Kind; options?: ReadonlyArray<readonly [string, string]>; listId?: string; mono?: boolean; span?: 2 | 3 }

const parseNum = (v: string, kind: Kind) => {
  const s = kind === 'signed' ? v.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '') : kind === 'decimal' ? v.replace(/[^0-9.]/g, '') : v.replace(/[^0-9]/g, '');
  if (s === '' || s === '-') return undefined;
  return Number(s);
};

/** One field bound to a path in an object. Amounts are whole rupees; decimals are for rates and shares. */
export function Field({ col, value, onChange }: { col: Col; value: unknown; onChange: (v: unknown) => void }) {
  const kind = col.kind ?? 'text';
  const span = col.span === 2 ? 'sm:col-span-2' : col.span === 3 ? 'sm:col-span-3' : '';
  if (kind === 'bool') {
    return (
      <label className={`flex items-center gap-2 pt-5 text-[13px] text-pos-ink/75 ${span}`}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {col.label}
      </label>
    );
  }
  if (kind === 'select') {
    return (
      <label className={`${labelCls} ${span}`}>{col.label}
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          {(col.options ?? []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    );
  }
  const numeric = kind === 'amount' || kind === 'signed' || kind === 'decimal';
  return (
    <label className={`${labelCls} ${span}`}>{col.label}
      <input
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        list={col.listId}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => onChange(numeric ? parseNum(e.target.value, kind) : e.target.value)}
        className={`${inputCls} ${numeric || col.mono ? 'font-mono' : ''} ${numeric ? 'text-right' : ''}`}
        autoComplete="off"
      />
    </label>
  );
}

/** Fields of one object, laid out in a grid. */
export function FieldGrid({ cols, value, onChange }: { cols: Col[]; value: unknown; onChange: (v: Obj) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {cols.map((c) => <Field key={c.key} col={c} value={getPath(value, c.key)} onChange={(v) => onChange(setPath((value ?? {}) as Obj, c.key, v))} />)}
    </div>
  );
}

const blankFor = (cols: Col[]) => cols.reduce<Obj>((o, c) => {
  const kind = c.kind ?? 'text';
  const v = kind === 'amount' || kind === 'signed' ? 0 : kind === 'bool' ? false : kind === 'select' ? c.options?.[0]?.[0] ?? '' : kind === 'decimal' ? undefined : '';
  return v === undefined ? o : setPath(o, c.key, v);
}, {});

/** A table of rows, each row a small grid of fields, with add and remove. */
export function RowsEditor({ title, cols, rows, onChange, addLabel = 'Add a row', note }: { title?: string; cols: Col[]; rows: Obj[] | undefined; onChange: (rows: Obj[]) => void; addLabel?: string; note?: string }) {
  const list = rows ?? [];
  return (
    <div className="space-y-2">
      {title && <h4 className="text-[13px] font-semibold text-pos-ink">{title}</h4>}
      {note && <p className="text-[12px] text-pos-ink/55">{note}</p>}
      {list.map((r, k) => (
        <div key={k} className="flex items-start gap-2 rounded-[10px] bg-pos-muted p-2">
          <div className="min-w-0 flex-1"><FieldGrid cols={cols} value={r} onChange={(v) => onChange(list.map((x, n) => (n === k ? v : x)))} /></div>
          <button type="button" aria-label="Remove row" onClick={() => onChange(list.filter((_, n) => n !== k))} className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/60 hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, blankFor(cols)])} className="flex items-center gap-1 text-[13px] text-pos-accent"><Plus className="h-4 w-4" /> {addLabel}</button>
    </div>
  );
}

/** Address columns under a prefix, for use inside a row or a grid. */
export const addressCols = (prefix: string, states: ReadonlyArray<readonly [string, string]>): Col[] => [
  { key: `${prefix}.line1`, label: 'Address line 1', span: 2 },
  { key: `${prefix}.line2`, label: 'Address line 2' },
  { key: `${prefix}.city`, label: 'City or district' },
  { key: `${prefix}.stateCode`, label: 'State', kind: 'select', options: states },
  { key: `${prefix}.pin`, label: 'PIN code', mono: true },
];
