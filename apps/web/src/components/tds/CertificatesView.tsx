'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { CertificateFinding } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

export interface CertificateRow { id: string; certificateNo: string; pan: string; name: string; sectionCode: string; ratePercent: string; amountLimit: string; validFrom: string; validTo: string; used?: string; remaining?: string; rows?: number }

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';

/** Lower or nil deduction certificates held by payees, and the flag A rows checked against them. */
export function CertificatesView({ tan, certificates, findings, onSaved }: { tan: string; certificates: CertificateRow[]; findings: CertificateFinding[]; onSaved: () => void }) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ certificateNo: '', pan: '', name: '', sectionCode: '1027', ratePercent: '', amountLimit: '', validFrom: '', validTo: '' });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await authFetch('/api/v1/tds/certificates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tan, ...f, pan: f.pan.toUpperCase(), certificateNo: f.certificateNo.toUpperCase(), ratePercent: Number(f.ratePercent), amountLimit: Number(f.amountLimit) }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'Not saved.');
    setOpen(false);
    setF({ certificateNo: '', pan: '', name: '', sectionCode: '1027', ratePercent: '', amountLimit: '', validFrom: '', validTo: '' });
    onSaved();
  };
  const field = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-[12px] text-pos-ink/60">{label}<input required className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white"><Plus className="h-4 w-4" /> Record a certificate</button></div>
      {open && (
        <form onSubmit={save} className="pos-card grid gap-3 p-4 sm:grid-cols-4">
          {field('certificateNo', 'Certificate number', { maxLength: 15, className: `${input} font-mono uppercase` })}
          {field('pan', 'Payee PAN', { maxLength: 10, className: `${input} font-mono uppercase` })}
          {field('name', 'Payee name', { maxLength: 75 })}
          {field('sectionCode', 'Section code', { maxLength: 4, inputMode: 'numeric' })}
          {field('ratePercent', 'Rate on certificate (%)', { inputMode: 'decimal' })}
          {field('amountLimit', 'Amount it covers (₹)', { inputMode: 'decimal' })}
          {field('validFrom', 'Valid from', { type: 'date' })}
          {field('validTo', 'Valid to', { type: 'date' })}
          {error && <p className="text-[13px] text-[#dc2626] sm:col-span-4">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-4"><button type="button" onClick={() => setOpen(false)} className="rounded-full border border-pos-line px-4 py-2 text-[13px]">Cancel</button><button type="submit" className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white">Save</button></div>
        </form>
      )}
      <section className="pos-card overflow-x-auto">
        <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Certificates</h3>
        {certificates.length ? (
          <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Certificate</th><th className={th}>Payee</th><th className={th}>Code</th><th className={th}>Rate</th><th className={th}>Valid</th><th className={`${th} text-right`}>Covers</th><th className={`${th} text-right`}>Used</th><th className={`${th} text-right`}>Left</th></tr></thead>
            <tbody>{certificates.map((c) => <tr key={c.id} className="border-t border-pos-line"><td className={`${td} font-mono`}>{c.certificateNo}</td><td className={td}>{c.name} <span className="font-mono text-pos-ink/50">{c.pan}</span></td><td className={td}>{c.sectionCode}</td><td className={td}>{Number(c.ratePercent)}%</td><td className={td}>{nice(c.validFrom)} to {nice(c.validTo)}</td><td className={`${td} text-right`}>{inr(c.amountLimit)}</td><td className={`${td} text-right`}>{inr(c.used ?? 0)}</td><td className={`${td} text-right ${Number(c.remaining ?? 1) === 0 ? 'text-[#dc2626]' : ''}`}>{inr(c.remaining ?? c.amountLimit)}</td></tr>)}</tbody></table>
        ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">No certificates recorded for this year.</p>}
      </section>
      <section className="pos-card overflow-x-auto">
        <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Rows relying on a certificate (reason A)</h3>
        {findings.length ? <ul>{findings.map((x, i) => <li key={i} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0"><span className="text-pos-ink">{x.name} <span className="font-mono text-pos-ink/50">{x.pan}</span> {x.certificateNo}</span><span className="text-[#b45309]">{x.message}</span></li>)}</ul> : <p className="px-4 py-4 text-[13px] text-pos-ink/55">Every reason A row matches a certificate.</p>}
      </section>
    </div>
  );
}
