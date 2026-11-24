'use client';

import React from 'react';
import { GSTN_STATE_CODES } from '@synextax/tax-engine';

export const inputCls = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
export const btnCls = 'inline-flex h-9 items-center gap-2 rounded-[10px] bg-pos-accent px-4 text-[13px] font-semibold text-white disabled:opacity-50';
export const ghostCls = 'inline-flex h-9 items-center gap-2 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] font-medium text-pos-ink/80 hover:bg-pos-muted disabled:opacity-50';
export const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap text-pos-ink/60';
export const thr = 'px-3 py-2 text-right text-[12px] font-medium whitespace-nowrap text-pos-ink/60';
export const td = 'px-3 py-2 text-left text-[13px] text-pos-ink';
export const tdr = 'px-3 py-2 text-right text-[13px] font-mono tabular-nums text-pos-ink';

export const inr = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** State and union territory codes for place of supply and customer state (96 and 97 left out: exports are not billed here). */
export const STATES = Object.entries(GSTN_STATE_CODES as Record<string, string>)
  .filter(([code]) => code !== '96' && code !== '97')
  .sort((a, b) => a[1].localeCompare(b[1]));
export const stateName = (code: string | null | undefined) => (code ? (GSTN_STATE_CODES as Record<string, string>)[code] ?? code : '');

export const fyLabel = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
export const currentFy = () => {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dmy = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export interface Item {
  id: string;
  name: string;
  hsn: string;
  isService: boolean;
  unit: string;
  gstRate: number;
  cessRate: number;
  salePrice: string;
  openingQty: string;
  openingValue: string;
  active: boolean;
  version: string;
}

export interface Customer {
  id: string;
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  stateCode: string;
  address1: string;
  address2: string | null;
  place: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  version: string;
}

export interface Series {
  id: string;
  fy: number;
  docType: 'INV' | 'CRN' | 'DBN';
  prefix: string;
  padWidth: number;
  nextNo: number;
  nextDocNo: string;
}

export const DOC_LABEL: Record<string, string> = { INV: 'Tax invoice', CRN: 'Credit note', DBN: 'Debit note' };

export async function errorText(r: Response): Promise<string> {
  const b = (await r.json().catch(() => ({}))) as { message?: string; details?: unknown };
  const details = Array.isArray(b.details) ? ` ${b.details.join(' ')}` : '';
  return `${b.message ?? 'Something went wrong. Try again.'}${details}`;
}

export function downloadText(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-[12px] font-medium text-pos-ink/70">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] font-normal text-pos-ink/60">{hint}</span>}
    </label>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]' : tone === 'ok' ? 'border-[#86efac] bg-[#f0fdf4] text-[#166534]' : 'border-pos-line bg-pos-muted text-pos-ink/80';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[10px] border px-3 py-2 text-[13px] ${cls}`}>{children}</div>;
}
