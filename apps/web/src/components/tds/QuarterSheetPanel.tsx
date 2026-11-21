'use client';

import React, { useState } from 'react';
import type { QuarterChallan } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const input = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';

/** This quarter's payments pasted from Excel, saved as challans and rows for the statement. */
export function QuarterSheetPanel({ tans }: { tans: string[] }) {
  const { authFetch } = useAuth();
  const [tan, setTan] = useState(tans[0] ?? '');
  const [form, setForm] = useState<'140' | '138' | '144' | '143'>('140');
  const [taxYear, setTaxYear] = useState(2026);
  const [quarter, setQuarter] = useState(3);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ challans: QuarterChallan[]; errors: Array<{ line: number; message: string }>; missing: string[] } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const send = async (path: 'preview' | 'import') => {
    setMessage(null);
    const r = await authFetch(`/api/v1/tds/quarter/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tan: tan || tans[0], form, taxYear, quarter, text }) });
    const b = await r.json().catch(() => ({}));
    if (path === 'preview') return r.ok ? setPreview(b) : setMessage({ tone: 'bad', text: b.message ?? 'Could not read the sheet.' });
    if (r.ok) {
      setMessage({ tone: 'ok', text: `Saved ${b.rows} row(s) on ${b.challans} challan(s). Write the statement file from Prepare statement.` });
      setPreview(null);
      setText('');
    } else setMessage({ tone: 'bad', text: b.message ?? 'Not saved.' });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="text-[14px] font-semibold text-pos-ink">This quarter&apos;s payments</h2>
      <p className="text-[13px] text-pos-ink/65">Paste your working sheet: one row per payment with its challan. Headings needed: BSR code, challan no, challan date, section, PAN, name, amount paid, paid on, TDS (and optionally deducted on, deposited, rate, reason, certificate, interest, fee).</p>
      <div className="flex flex-wrap gap-2 text-[13px] text-pos-ink/60">
        <select aria-label="TAN" value={tan || tans[0] || ''} onChange={(e) => setTan(e.target.value)} className={`${input} font-mono`}>{tans.map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Form" value={form} onChange={(e) => setForm(e.target.value as typeof form)} className={input}>{(['140', '138', '144', '143'] as const).map((f) => <option key={f} value={f}>Form {f}</option>)}</select>
        <select aria-label="Tax year" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} className={input}>{[2026, 2027].map((y) => <option key={y} value={y}>TY {y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}</select>
        <select aria-label="Quarter" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={input}>{[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}</select>
      </div>
      <textarea aria-label="Quarter sheet" rows={6} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} className="w-full rounded-[10px] border border-pos-line bg-pos-surface p-3 font-mono text-[12px] text-pos-ink outline-none focus:border-pos-accent" />
      <div className="flex gap-2">
        <button type="button" disabled={!text.trim() || !tans.length} onClick={() => send('preview')} className="rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink disabled:opacity-40">Check</button>
        <button type="button" disabled={!preview || preview.errors.length > 0 || !preview.challans.length} onClick={() => send('import')} className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">Save to the quarter</button>
      </div>
      {message && <p role="status" className={`text-[13px] ${message.tone === 'ok' ? 'text-[#15803d]' : 'text-[#dc2626]'}`}>{message.text}</p>}
      {preview?.missing.length ? <p className="text-[13px] text-[#dc2626]">Columns not found: {preview.missing.join(', ')}.</p> : null}
      {preview?.errors.length ? <ul className="space-y-1 text-[13px] text-[#dc2626]">{preview.errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}</ul> : null}
      {preview && preview.challans.length > 0 && (
        <ul className="divide-y divide-pos-line rounded-[10px] border border-pos-line text-[13px]">
          {preview.challans.map((c) => (
            <li key={c.key} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-pos-ink"><span>Challan {c.challanNo}, BSR {c.bsr}, {c.depositedOn}</span><span className="text-pos-ink/60">{c.rows.length} row(s), tax {inr(c.tax)}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
