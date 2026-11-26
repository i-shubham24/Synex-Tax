'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { ASSESSMENT_YEARS, STATUS_LABEL, btnQuiet, inr, niceDate, type Ay } from '../../../../components/itr/returns/returnsShared';

interface Row {
  entityId: string; name: string; pan: string; constitution: string; returnId: string | null; form: string | null; regime: string | null;
  status: 'DRAFT' | 'READY' | 'FILED' | 'NONE'; ackNumber: string | null; filedOn: string | null; totalIncome: number | null; totalTax: number | null; payable: number | null;
}

const FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-U'];
const sel = 'h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-[13px] text-pos-ink';
const th = 'px-2 py-2 text-left text-[12px] font-medium text-pos-ink/70 whitespace-nowrap';
const td = 'px-2 py-2 text-[13px] text-pos-ink whitespace-nowrap';

/** Assessee register: every client for an assessment year with its return form, status and acknowledgement. */
export default function AssesseeRegisterPage() {
  const { authFetch } = useAuth();
  const [ay, setAy] = useState<Ay>('2026-27');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [canExport, setCanExport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useCallback(() => {
    const p = new URLSearchParams({ assessmentYear: ay });
    if (status) p.set('status', status);
    if (form) p.set('form', form);
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [ay, status, form, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      authFetch(`/api/v1/itr-returns/register?${params()}`)
        .then(async (r) => {
          const b = await r.json().catch(() => ({}));
          if (!r.ok) { setError(b.message ?? 'The register could not be loaded.'); setRows([]); return; }
          setError(null); setRows(b.rows ?? []); setCanExport(!!b.canExport);
        })
        .catch(() => setError('Could not reach the server.'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [authFetch, params]);

  const exportCsv = async () => {
    const r = await authFetch(`/api/v1/itr-returns/register.csv?${params()}`);
    if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b.message ?? 'The register could not be exported.'); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `assessee-register-AY-${ay}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const count = (s: Row['status']) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Assessee register</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/65">Every client for the assessment year, with the return form, status, acknowledgement and date of filing from the saved returns. PANs are masked.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/itr" className={btnQuiet}>Open income tax</Link>
          {canExport && <button type="button" onClick={exportCsv} className={btnQuiet}><Download className="h-4 w-4" /> Export CSV</button>}
        </div>
      </div>

      <div className="pos-card flex flex-wrap items-center gap-3 p-4 text-[13px] text-pos-ink/75">
        <label className="flex items-center gap-2">Assessment year
          <select value={ay} onChange={(e) => setAy(e.target.value as Ay)} className={sel}>{ASSESSMENT_YEARS.map((y) => <option key={y} value={y}>AY {y}</option>)}</select>
        </label>
        <label className="flex items-center gap-2">Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value="">All</option>{(['NONE', 'DRAFT', 'READY', 'FILED'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">Form
          <select value={form} onChange={(e) => setForm(e.target.value)} className={sel}><option value="">All</option>{FORMS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        </label>
        <label className="flex flex-1 items-center gap-2">Search
          <input value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder="Client name" className={`${sel} min-w-[160px] flex-1 px-3`} />
        </label>
      </div>

      {!status && rows.length > 0 && (
        <p className="text-[13px] text-pos-ink/70">{rows.length} clients: {count('FILED')} filed, {count('READY')} ready to file, {count('DRAFT')} in draft, {count('NONE')} not started.</p>
      )}
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}

      <div className="pos-card relative w-full min-w-0 max-w-full overflow-hidden">
        <div className="relative overflow-x-auto p-2">
          <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-pos-line">
              <th className={th}>Client</th><th className={th}>PAN</th><th className={th}>Form</th><th className={th}>Status</th><th className={th}>Acknowledgement</th>
              <th className={th}>Filed on</th><th className={`${th} text-right`}>Total income</th><th className={`${th} text-right`}>Refund or payable</th><th className={`${th} relative`}><span className="sr-only">Print</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={9} className={`${td} text-pos-ink/65`}>Loading the register.</td></tr>}
            {!loading && rows.length === 0 && !error && <tr><td colSpan={9} className={`${td} text-pos-ink/65`}>No clients match these filters.</td></tr>}
            {rows.map((r) => (
              <tr key={r.entityId} className="border-b border-pos-line/60">
                <td className={`${td} max-w-[260px] truncate`} title={r.name}>{r.name}</td>
                <td className={`${td} font-mono`}>{r.pan}</td>
                <td className={td}>{r.form ?? ''}</td>
                <td className={td}>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] ${r.status === 'FILED' ? 'bg-[#22a356]/10 text-[#15803d]' : r.status === 'READY' ? 'bg-pos-accent/10 text-pos-ink' : r.status === 'DRAFT' ? 'bg-[#b45309]/10 text-[#b45309]' : 'text-pos-ink/65'}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className={`${td} font-mono`}>{r.ackNumber ?? ''}</td>
                <td className={td}>{niceDate(r.filedOn)}</td>
                <td className={`${td} text-right font-mono tabular-nums`}>{inr(r.totalIncome)}</td>
                <td className={`${td} text-right font-mono tabular-nums`}>{r.payable === null ? '' : r.payable > 0 ? `Pay ${inr(r.payable)}` : r.payable < 0 ? `Refund ${inr(-r.payable)}` : 'Nil'}</td>
                <td className={td}>{r.returnId && <Link href={`/itr/print/${r.returnId}`} aria-label={`Computation of income for ${r.name}`} className="inline-flex items-center gap-1 text-[12px] text-pos-accent hover:underline"><Printer className="h-3.5 w-3.5" /> Computation</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {!canExport && <p className="text-[12px] text-pos-ink/70">Only a partner can export the register.</p>}
    </div>
  );
}
