'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, FileText, FileUp, HeartPulse, Users } from 'lucide-react';
import type { TdsHealthReport } from '@synextax/tax-engine';
import { useAuth } from '../../../../context/AuthContext';
import { StatementPanel } from '../../../../components/tds/StatementPanel';
import { RegistersPanel } from '../../../../components/tds/RegistersPanel';
import { QuarterSheetPanel } from '../../../../components/tds/QuarterSheetPanel';

type Tab = 'health' | 'statement' | 'registers' | 'import' | 'payees';
const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

interface Preview {
  form: string;
  tan: string;
  tanKnown: boolean;
  deductorName: string;
  taxYear: number | null;
  quarter: number | null;
  challans: number;
  deductees: number;
  totalDeposited: string;
  sections: Array<{ code: string; nature: string }>;
  issues: Array<{ line: number; level: 'error' | 'warning'; message: string }>;
}

function Tile({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-[#22a356]' : tone === 'warn' ? 'text-[#b45309]' : 'text-[#dc2626]';
  return (
    <div className="pos-card p-4">
      <p className="text-[12px] text-pos-ink/55">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Section({ title, empty, children, count }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <section className="pos-card overflow-hidden">
      <h2 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">{title}</h2>
      {count ? <div className="overflow-x-auto">{children}</div> : <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-pos-ink/55"><CheckCircle2 className="h-4 w-4 text-[#22a356]" />{empty}</p>}
    </section>
  );
}

const th = 'px-4 py-2 text-left text-[12px] font-medium';
const td = 'px-4 py-2 text-[13px] text-pos-ink';

export default function TdsHealthPage() {
  const { authFetch, user } = useAuth();
  const [tab, setTab] = useState<Tab>('health');
  const [tans, setTans] = useState<string[]>([]);
  const [tan, setTan] = useState<string>('');
  const [report, setReport] = useState<TdsHealthReport | null>(null);
  const [payees, setPayees] = useState<Array<{ pan: string; name: string; sections: string[]; payments: number; amount_paid: string; last_paid: string }>>([]);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authFetch('/api/v1/client-master/tan-registrations')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ tan: string }>) => {
        const list = [...new Set((Array.isArray(rows) ? rows : []).map((r) => r.tan))].sort();
        setTans(list);
      })
      .catch(() => {});
  }, [authFetch]);

  const loadHealth = useCallback(() => {
    authFetch(`/api/v1/tds/health${tan ? `?tan=${tan}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => setReport(null));
  }, [authFetch, tan]);

  useEffect(() => {
    if (tab === 'health') loadHealth();
    if (tab === 'payees' && tan) {
      authFetch(`/api/v1/tds/payees?tan=${tan}`)
        .then((r) => (r.ok ? r.json() : { payees: [] }))
        .then((d) => setPayees(d.payees ?? []))
        .catch(() => setPayees([]));
    }
  }, [tab, tan, loadHealth, authFetch]);

  async function onFile(file: File) {
    setMessage(null);
    setPreview(null);
    if (file.size > 5 * 1024 * 1024) return setMessage('Statement files up to 5 MB.');
    if (!/\.txt$/i.test(file.name)) return setMessage('Choose the statement text file (.txt) your return software created for Form 140.');
    const content = await file.text();
    setText(content);
    setBusy(true);
    try {
      const r = await authFetch('/api/v1/tds/import/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: content }) });
      setPreview(r.ok ? await r.json() : null);
      if (!r.ok) setMessage('The file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await authFetch('/api/v1/tds/import/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const body = await r.json();
      if (r.status === 201) {
        setMessage(`Imported: ${body.challans} challan(s), ${body.deductees} deductee row(s). The quarter is kept as closed history.`);
        setPreview(null);
        setText('');
      } else setMessage(body.message ?? 'Not imported.');
    } finally {
      setBusy(false);
    }
  }

  const errors = preview?.issues.filter((i) => i.level === 'error') ?? [];
  const canImport = preview && !errors.length && preview.tanKnown && ['PARTNER', 'MANAGER'].includes(user?.role ?? '');

  return (
    <div className="space-y-5">
      <div>
        <Link href="/tds" className="inline-flex items-center gap-1.5 text-[13px] text-pos-ink/55 hover:text-pos-accent"><ArrowLeft className="h-4 w-4" /> Dual-Act TDS</Link>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">TDS health and past statements</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-pos-ink/60">What will cost a client money if left alone, and the history you bring in from earlier software.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist">
          {([['health', 'Health', HeartPulse], ['statement', 'Prepare statement', FileText], ['registers', 'Registers', BookOpen], ['import', 'Import past statements', FileUp], ['payees', 'Payee master', Users]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] ${tab === id ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {tab !== 'import' && (
          <label className="flex items-center gap-2 text-[13px] text-pos-ink/60">
            TAN
            <select value={tan} onChange={(e) => setTan(e.target.value)} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 font-mono text-pos-ink">
              {tab === 'health' && <option value="">All TANs</option>}
              {tab !== 'health' && !tan && <option value="">Choose a TAN</option>}
              {tans.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </div>

      {tab === 'health' && report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Unconsumed challan balance" value={inr(report.totals.unconsumed)} tone={Number(report.totals.unconsumed) ? 'warn' : 'ok'} />
            <Tile label="Over-consumed challans" value={inr(report.totals.overConsumed)} tone={Number(report.totals.overConsumed) ? 'bad' : 'ok'} />
            <Tile label="Interest for late payment" value={inr(report.totals.interest)} tone={Number(report.totals.interest) ? 'bad' : 'ok'} />
            <Tile label="Late filing fee so far" value={inr(report.totals.lateFees)} tone={Number(report.totals.lateFees) ? 'bad' : 'ok'} />
          </div>

          <Section title="Challans" count={report.challans.filter((c) => c.state !== 'BALANCED').length} empty="Every challan is fully used by deductee rows.">
            <table className="w-full min-w-[640px]"><thead className="bg-[#141416] text-white"><tr><th className={th}>Challan</th><th className={th}>Deposited</th><th className={th}>Used by deductees</th><th className={th}>Balance</th></tr></thead>
              <tbody>{report.challans.filter((c) => c.state !== 'BALANCED').map((c) => (
                <tr key={c.id} className="border-t border-pos-line"><td className={`${td} font-mono`}>{c.label}</td><td className={td}>{inr(c.deposited)}</td><td className={td}>{inr(c.consumed)}</td>
                  <td className={`${td} ${c.state === 'OVER_CONSUMED' ? 'text-[#dc2626]' : 'text-[#b45309]'}`}>{inr(c.balance)} {c.state === 'OVER_CONSUMED' ? '(rows claim more than was paid)' : '(not yet used)'}</td></tr>
              ))}</tbody></table>
          </Section>

          <Section title="Paid after the due date" count={report.lateDeposits.length} empty="All tax was paid by the 7th of the following month.">
            <table className="w-full min-w-[640px]"><thead className="bg-[#141416] text-white"><tr><th className={th}>Payee</th><th className={th}>Deducted</th><th className={th}>Due</th><th className={th}>Paid</th><th className={th}>Interest</th></tr></thead>
              <tbody>{report.lateDeposits.map((d) => (
                <tr key={d.deducteeId} className="border-t border-pos-line"><td className={td}>{d.name}</td><td className={td}>{nice(d.deductedOn)}</td><td className={td}>{nice(d.dueOn)}</td><td className={td}>{nice(d.paidOn)}</td><td className={`${td} text-[#dc2626]`}>{inr(d.interest)} ({d.months} mo)</td></tr>
              ))}</tbody></table>
          </Section>

          <Section title="Statements past their due date" count={report.lateFees.length} empty="No statement is late.">
            <ul>{report.lateFees.map((f) => (
              <li key={f.returnId} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0"><span className="text-pos-ink">{f.label}, due {nice(f.dueOn)}</span><span className="text-[#dc2626]">{f.daysLate} days, fee {inr(f.fee)}</span></li>
            ))}</ul>
          </Section>

          <Section title="PAN problems" count={report.panIssues.length} empty="Every payee has a valid, operative PAN.">
            <ul>{report.panIssues.map((p) => (
              <li key={p.deducteeId} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0"><span className="text-pos-ink">{p.name} <span className="font-mono text-pos-ink/50">{p.pan}</span></span><span className="text-[#b45309]">{p.reason}</span></li>
            ))}</ul>
          </Section>

          <Section title="Correction windows closing in 90 days" count={report.correctionsClosing.length} empty="No correction window closes in the next 90 days.">
            <ul>{report.correctionsClosing.map((c) => (
              <li key={c.returnId} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0"><span className="text-pos-ink">{c.label}</span><span className="text-[#b45309]">closes {nice(c.closesOn)}, {c.daysLeft} days left</span></li>
            ))}</ul>
          </Section>
        </>
      )}

      {tab === 'statement' && <StatementPanel tan={tan} />}
      {tab === 'registers' && <RegistersPanel tan={tan} />}

      {tab === 'import' && (
        <div className="pos-card space-y-4 p-5">
          <p className="text-[13.5px] text-pos-ink/65">
            Choose a regular statement text file (the .txt your return software produced for upload): Form 138, 140, 144 or 143, or 24Q, 26Q, 27Q or 27EQ for periods up to March 2026. It is checked against Protean&apos;s file format for that form before anything is saved, and kept as closed history for that quarter. Quarter 4 salary details in 24Q files are not brought in; the deductee rows are.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-pos-line px-6 py-8 text-[14px] text-pos-ink/60 hover:border-pos-accent">
            <FileUp className="h-6 w-6" /> {busy ? 'Reading' : 'Choose a statement file (.txt, up to 5 MB)'}
            <input type="file" accept=".txt,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {preview && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
                {[
                  ['Form', preview.form || 'Unknown'],
                  ['TAN', `${preview.tan}${preview.tanKnown ? '' : ' (not in Client Master)'}`],
                  ['Deductor', preview.deductorName],
                  ['Period', preview.taxYear ? `Q${preview.quarter} ${/Q$/.test(preview.form) ? 'FY' : 'TY'} ${preview.taxYear}-${String((preview.taxYear + 1) % 100).padStart(2, '0')}` : 'Unknown'],
                  ['Challans', String(preview.challans)],
                  ['Deductee rows', String(preview.deductees)],
                  ['Deposited', inr(preview.totalDeposited)],
                  ['Sections', preview.sections.map((s) => s.code).join(', ')],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[12px] bg-pos-muted px-3 py-2"><dt className="text-pos-ink/50">{k}</dt><dd className="mt-0.5 font-medium text-pos-ink">{v}</dd></div>
                ))}
              </dl>
              {preview.issues.length > 0 && (
                <ul className="space-y-1 text-[13px]">
                  {preview.issues.map((i, k) => (
                    <li key={k} className={`flex gap-2 ${i.level === 'error' ? 'text-[#b91c1c]' : 'text-[#b45309]'}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{i.line ? `Line ${i.line}: ` : ''}{i.message}</li>
                  ))}
                </ul>
              )}
              {!preview.tanKnown && preview.tan && <p className="text-[13px] text-[#b45309]">Add the client and TAN {preview.tan} in Client Master first.</p>}
              <button type="button" disabled={!canImport || busy} onClick={commit} className="rounded-full bg-[#22a356] px-5 py-2.5 text-[14px] font-medium text-white disabled:opacity-40">
                Import this statement
              </button>
            </div>
          )}
          {message && <p role="status" className="text-[13.5px] text-pos-ink/75">{message}</p>}
        </div>
      )}
      {tab === 'import' && <QuarterSheetPanel tans={tans} />}

      {tab === 'payees' && (
        <Section title={`Payees${tan ? ` of ${tan}` : ''}`} count={payees.length} empty={tan ? 'No deductee rows for this TAN yet.' : 'Choose a TAN to see its payees.'}>
          <table className="w-full min-w-[720px]"><thead className="bg-[#141416] text-white"><tr><th className={th}>Name</th><th className={th}>PAN</th><th className={th}>Sections</th><th className={th}>Payments</th><th className={th}>Paid</th><th className={th}>Last paid</th></tr></thead>
            <tbody>{payees.map((p) => (
              <tr key={`${p.pan}-${p.name}`} className="border-t border-pos-line"><td className={td}>{p.name}</td><td className={`${td} font-mono`}>{p.pan}</td><td className={td}>{p.sections.join(', ')}</td><td className={td}>{p.payments}</td><td className={td}>{inr(p.amount_paid)}</td><td className={td}>{p.last_paid ? nice(p.last_paid) : ''}</td></tr>
            ))}</tbody></table>
        </Section>
      )}
    </div>
  );
}
