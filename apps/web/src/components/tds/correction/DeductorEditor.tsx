'use client';

import React from 'react';

const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';

export interface PartyAddress { line1: string; line2: string; line3: string; line4: string; district: string; stateCode: string; pin: string }
export interface ConsoDeductor {
  name: string; pan: string; address: PartyAddress; email: string; phoneCountryCode: string; phone: string; type: string; gstin: string;
  responsible: { name: string; designation: string; pan: string; address: PartyAddress; email: string; phoneCountryCode: string; phone: string };
  government: { stateCode: string; ministryCode: string; ministryOther: string; ain: string };
}
/** Only the fields typed in are changed; a blank box keeps what was filed. */
export type DeductorEdit = Record<string, string>;

const ADDRESS: [string, string][] = [['line1', 'Address line 1'], ['line2', 'Address line 2'], ['line3', 'Address line 3'], ['line4', 'Address line 4'], ['district', 'Town or district'], ['stateCode', 'State code'], ['pin', 'PIN']];
const GROUPS: { title: string; fields: [string, string][] }[] = [
  { title: 'Deductor', fields: [['name', 'Name'], ['type', 'Deductor type'], ['email', 'Email'], ['phoneCountryCode', 'Phone code'], ['phone', 'Phone'], ['gstin', 'GSTIN'], ...ADDRESS.map(([k, l]) => [`address.${k}`, l] as [string, string])] },
  { title: 'Person responsible', fields: [['responsible.name', 'Name'], ['responsible.designation', 'Designation'], ['responsible.pan', 'PAN'], ['responsible.email', 'Email'], ['responsible.phoneCountryCode', 'Phone code'], ['responsible.phone', 'Phone'], ...ADDRESS.map(([k, l]) => [`responsible.address.${k}`, l] as [string, string])] },
  { title: 'Government deductors', fields: [['government.stateCode', 'State (Annexure 5)'], ['government.ministryCode', 'Ministry code'], ['government.ministryOther', 'Ministry name, if 99'], ['government.ain', 'AIN']] },
];
const UPPER = new Set(['type', 'gstin', 'responsible.pan', 'government.ain']);

const get = (o: unknown, path: string) => {
  let v: unknown = o;
  for (const k of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v === undefined || v === null ? '' : String(v);
};

/** Flat edit (dotted keys) to the nested shape the API takes. */
export function deductorEditPayload(e: DeductorEdit): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [path, v] of Object.entries(e)) {
    if (!v.trim()) continue;
    const keys = path.split('.');
    let t = out;
    for (const k of keys.slice(0, -1)) t = (t[k] ??= {}) as Record<string, unknown>;
    t[keys[keys.length - 1]] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Nested edit from a saved draft back to dotted keys. */
export function deductorEditFromPayload(p: unknown, prefix = ''): DeductorEdit {
  const out: DeductorEdit = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    if (v && typeof v === 'object') Object.assign(out, deductorEditFromPayload(v, `${prefix}${k}.`));
    else if (v !== undefined && v !== null && v !== '') out[`${prefix}${k}`] = String(v);
  }
  return out;
}

/** C1: deductor and responsible person details from the batch header. */
export function DeductorEditor({ current, value, onChange }: { current: ConsoDeductor | null; value: DeductorEdit; onChange: (v: DeductorEdit) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-pos-ink/60">
        Type only what changes; a blank box keeps what was filed. These go in a deductor details correction (C1), with no challans or payee rows.
        PANs show masked; type the full PAN to change it.
      </p>
      {GROUPS.map((g) => (
        <div key={g.title} className="space-y-2">
          <h4 className="text-[13px] font-medium text-pos-ink">{g.title}</h4>
          <div className="grid gap-2 sm:grid-cols-4">
            {g.fields.map(([path, label]) => {
              const was = get(current, path);
              return (
                <label key={path} className="text-[12px] text-pos-ink/60">{label}
                  <input
                    value={value[path] ?? ''}
                    placeholder={was || 'blank'}
                    onChange={(e) => onChange({ ...value, [path]: UPPER.has(path) ? e.target.value.toUpperCase() : e.target.value })}
                    className={`${input} ${value[path] ? 'border-pos-accent' : ''}`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
