'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import type { DefaultAnalysis, DepositMonth, SectionLine } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

interface StatementLine { id: string; form: string; quarter: string; dueDate: string; filedOn: string | null; state: 'ON_TIME' | 'LATE' | 'OVERDUE' | 'NOT_DUE' | 'FILED_DATE_UNKNOWN'; daysLate: number }
interface Declaration { id: string; pan: string; name: string; identificationNo: string | null; receivedOn: string; seniorCitizen: boolean; incomeNature: string | null; estimatedIncome: string; estimatedTotalIncome: string; status: 'ACTIVE' | 'WITHDRAWN' }
interface Registers { analysis: DefaultAnalysis; deposits: DepositMonth[]; sections: SectionLine[]; statements: StatementLine[]; form121: Declaration[] }

type View = 'defaults' | 'deposits' | 'sections' | 'statements' | 'form121';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const th = 'px-4 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-4 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const STATE_LABEL: Record<StatementLine['state'], [string, string]> = {
  ON_TIME: ['On time', 'text-[#22a356]'],
  LATE: ['Late', 'text-[#dc2626]'],
  OVERDUE: ['Overdue', 'text-[#dc2626]'],
  NOT_DUE: ['Not due yet', 'text-pos-ink/55'],
  FILED_DATE_UNKNOWN: ['Filed (imported, date not in file)', 'text-pos-ink/55'],
};

function Card({ title, note, count, empty, children }: { title: string; note?: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="pos-card overflow-hidden">
      <div className="border-b border-pos-line px-4 py-3">
        <h3 className="text-[14px] font-semibold text-pos-ink">{title}</h3>
        {note && <p className="mt-0.5 text-[12px] text-pos-ink/55">{note}</p>}
      </div>
      {count ? <div className="overflow-x-auto">{children}</div> : <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-pos-ink/55"><CheckCircle2 className="h-4 w-4 text-[#22a356]" />{empty}</p>}
    </section>
  );
}

/** Default analysis, deposit register, section register (clause 34), statement register and Form 121 register for one TAN and year. */
export function RegistersPanel({ tan }: { tan: string }) {
  const { authFetch } = useAuth();
  const thisYear = new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const [year, setYear] = useState(thisYear);
  const [view, setView] = useState<View>('defaults');
  const [data, setData] = useState<Registers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ pan: '', name: '', identificationNo: '', receivedOn: '', seniorCitizen: false, incomeNature: '', estimatedIncome: '', estimatedTotalIncome: '' });
  const legacy = year < 2026;
  const yearLabel = `${legacy ? 'FY' : 'TY'} ${year}-${String((year + 1) % 100).padStart(2, '0')}`;

  const load = useCallback(async () => {
    if (!tan) return;
    setError(null);
    const res = await authFetch(`/api/v1/tds/registers?tan=${tan}&year=${year}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setData(null); setError(body.message ?? 'Could not load the registers.'); return; }
    setData(body);
  }, [authFetch, tan, year]);
  useEffect(() => { load(); }, [load]);

  const addDeclaration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await authFetch('/api/v1/tds/form121', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tan, taxYear: year, pan: form.pan.trim().toUpperCase(), name: form.name, identificationNo: form.identificationNo, receivedOn: form.receivedOn,
        seniorCitizen: form.seniorCitizen, incomeNature: form.incomeNature, estimatedIncome: Number(form.estimatedIncome || 0), estimatedTotalIncome: Number(form.estimatedTotalIncome || 0),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.message ?? 'Not saved.'); return; }
    setAdding(false);
    setForm({ pan: '', name: '', identificationNo: '', receivedOn: '', seniorCitizen: false, incomeNature: '', estimatedIncome: '', estimatedTotalIncome: '' });
    load();
  };

  const withdraw = async (id: string) => {
    const res = await authFetch(`/api/v1/tds/form121/${id}/withdraw`, { method: 'POST' });
    if (res.ok) load();
  };

  if (!tan) return <p className="pos-card px-4 py-4 text-[13px] text-pos-ink/55">Choose a TAN above to see its registers.</p>;
  const a = data?.analysis;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Register">
          {([['defaults', 'Defaults'], ['deposits', 'Deposits'], ['sections', 'Section-wise (clause 34)'], ['statements', 'Statements'], ['form121', 'Form 121 declarations']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] ${view === id ? 'bg-pos-ink text-pos-surface' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/60">
          Year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-pos-ink">
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y < 2026 ? 'FY' : 'TY'} {y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-[10px] border border-[#dc2626]/30 bg-[#dc2626]/5 px-3 py-2 text-[13px] text-[#dc2626]">{error}</p>}

      {a && view === 'defaults' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ['Interest for late deduction', a.totals.lateDeductionInterest],
              ['Interest for late deposit', a.totals.lateDepositInterest],
              ['Deducted, not deposited', a.totals.notDeposited],
              ['Interest still to pay', a.totals.interestDue],
            ] as const).map(([label, v]) => (
              <div key={label} className="pos-card p-4">
                <p className="text-[12px] text-pos-ink/55">{label}</p>
                <p className={`mt-1 text-[20px] font-semibold tabular-nums ${Number(v) > 0 ? 'text-[#dc2626]' : 'text-[#22a356]'}`}>{inr(v)}</p>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-pos-ink/55">Interest is 1% a month (or part) from payment or credit to deduction, and 1.5% a month from deduction to deposit when paid after the due date, on tax rounded down to the hundred. {inr(a.totals.interestPaid)} of interest is already allocated on this year&apos;s challans.</p>
          <Card title="Deducted late" count={a.lateDeductions.length} empty="Tax was deducted when each amount was paid or credited.">
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Payee</th><th className={th}>Code</th><th className={th}>Paid or credited</th><th className={th}>Deducted</th><th className={th}>Months</th><th className={`${th} text-right`}>Interest</th></tr></thead>
              <tbody>{a.lateDeductions.map((x) => <tr key={x.rowId} className="border-t border-pos-line"><td className={td}>{x.name}</td><td className={td}>{x.sectionCode}</td><td className={td}>{nice(x.paidOn)}</td><td className={td}>{nice(x.deductedOn)}</td><td className={td}>{x.months}</td><td className={num}>{inr(x.interest)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Deposited late" count={a.lateDeposits.length} empty="Every deduction was deposited by its due date.">
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Payee</th><th className={th}>Deducted</th><th className={th}>Due</th><th className={th}>Paid</th><th className={th}>Months</th><th className={`${th} text-right`}>Interest</th></tr></thead>
              <tbody>{a.lateDeposits.map((x) => <tr key={x.rowId} className="border-t border-pos-line"><td className={td}>{x.name}</td><td className={td}>{nice(x.deductedOn)}</td><td className={td}>{nice(x.dueOn)}</td><td className={td}>{nice(x.paidOn)}</td><td className={td}>{x.months}</td><td className={num}>{inr(x.interest)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Deducted but not deposited" count={a.notDeposited.length} empty="Everything deducted was deposited.">
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Payee</th><th className={th}>Code</th><th className={`${th} text-right`}>Deducted</th><th className={`${th} text-right`}>Deposited</th><th className={`${th} text-right`}>Short</th></tr></thead>
              <tbody>{a.notDeposited.map((x) => <tr key={x.rowId} className="border-t border-pos-line"><td className={td}>{x.name}</td><td className={td}>{x.sectionCode}</td><td className={num}>{inr(x.deducted)}</td><td className={num}>{inr(x.deposited)}</td><td className={num}>{inr(x.shortfall)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="No PAN, deducted below the higher rate" note="Without a PAN the rate is at least 20% (5% for purchase of goods and e-commerce). Salary is checked against the average rate for the year, so it is not listed here." count={a.noPanLowRate.length} empty="No payee without a PAN was taxed below the higher rate.">
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Payee</th><th className={th}>PAN</th><th className={th}>Code</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Rate used</th><th className={`${th} text-right`}>Short by</th></tr></thead>
              <tbody>{a.noPanLowRate.map((x) => <tr key={x.rowId} className="border-t border-pos-line"><td className={td}>{x.name}</td><td className={`${td} font-mono`}>{x.pan}</td><td className={td}>{x.sectionCode}</td><td className={num}>{inr(x.amountPaid)}</td><td className={num}>{x.rate}% (min {x.floor}%)</td><td className={num}>{inr(x.shortBy)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="No deduction on a declaration, but no Form 121 on file" note="Rows with reason flag B need a declaration from that payee in the Form 121 register." count={a.declarationsMissing.length} empty="Every flag B row has a declaration on file.">
            <ul>{a.declarationsMissing.map((x) => <li key={x.rowId} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0"><span className="text-pos-ink">{x.name} <span className="font-mono text-pos-ink/50">{x.pan}</span> {x.sectionCode}</span><span className="text-[#b45309]">{x.reason}</span></li>)}</ul>
          </Card>
        </>
      )}

      {data && view === 'deposits' && (
        <Card title={`Deposit register, ${yearLabel}`} note="Tax deducted in each month is due by the 7th of the next month (30 April for March)." count={data.deposits.length} empty="No deductions recorded for this year.">
          <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Month</th><th className={`${th} text-right`}>Deducted</th><th className={th}>Due</th><th className={th}>Paid by</th><th className={`${th} text-right`}>Deposited</th><th className={`${th} text-right`}>Late interest</th></tr></thead>
            <tbody>{data.deposits.map((m) => (
              <tr key={m.month} className="border-t border-pos-line align-top">
                <td className={td}>{monthName(m.month)}</td><td className={num}>{inr(m.deducted)}</td><td className={td}>{nice(m.dueOn)}</td>
                <td className={td}>{m.payments.map((p) => <div key={p.challanId} className={p.late ? 'text-[#dc2626]' : ''}>{p.label}, {p.paidOn ? nice(p.paidOn) : ''}, {inr(p.amount)}</div>)}</td>
                <td className={num}>{inr(m.deposited)}</td><td className={num}>{inr(m.lateInterest)}</td>
              </tr>
            ))}</tbody></table>
        </Card>
      )}

      {data && view === 'sections' && (
        <Card title={`Section-wise TDS, ${yearLabel}`} note="Laid out like clause 34(a) of the tax audit report. Columns 4 and 5 (all payments of the nature, and the part on which tax had to be deducted) come from the books, so they are not filled here." count={data.sections.length} empty="No deductions recorded for this year.">
          <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Form</th><th className={th}>Code</th><th className={`${th} text-right`}>Rows</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>At the full rate (6)</th><th className={`${th} text-right`}>Tax (7)</th><th className={`${th} text-right`}>Lower or nil (8)</th><th className={`${th} text-right`}>Tax (9)</th><th className={`${th} text-right`}>Not deposited (10)</th></tr></thead>
            <tbody>{data.sections.map((s) => (
              <tr key={`${s.form}-${s.sectionCode}`} className="border-t border-pos-line"><td className={td}>{s.form}</td><td className={td}>{s.sectionCode}</td><td className={num}>{s.payments}</td><td className={num}>{inr(s.amountPaid)}</td><td className={num}>{inr(s.fullRateAmount)}</td><td className={num}>{inr(s.fullRateTax)}</td><td className={num}>{inr(s.lowerRateAmount)}</td><td className={num}>{inr(s.lowerRateTax)}</td><td className={num}>{inr(s.notDeposited)}</td></tr>
            ))}</tbody></table>
        </Card>
      )}

      {data && view === 'statements' && (
        <Card title={`Statements, ${yearLabel}`} note="Due dates and filing dates, as clause 34(b) of the tax audit report asks." count={data.statements.length} empty="No statements recorded for this year.">
          <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Form</th><th className={th}>Quarter</th><th className={th}>Due</th><th className={th}>Filed</th><th className={th}>State</th><th className={`${th} text-right`}>Days late</th></tr></thead>
            <tbody>{data.statements.map((s) => (
              <tr key={s.id} className="border-t border-pos-line"><td className={td}>{s.form}</td><td className={td}>{s.quarter}</td><td className={td}>{nice(s.dueDate)}</td><td className={td}>{s.filedOn ? nice(s.filedOn) : ''}</td><td className={`${td} ${STATE_LABEL[s.state][1]}`}>{STATE_LABEL[s.state][0]}</td><td className={num}>{s.daysLate || ''}</td></tr>
            ))}</tbody></table>
        </Card>
      )}

      {data && view === 'form121' && (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white"><Plus className="h-4 w-4" /> Record a declaration</button>
          </div>
          {adding && (
            <form onSubmit={addDeclaration} className="pos-card grid gap-3 p-4 sm:grid-cols-2">
              <label className="text-[12px] text-pos-ink/60">Payee PAN<input required className={`${input} font-mono uppercase`} maxLength={10} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} /></label>
              <label className="text-[12px] text-pos-ink/60">Name<input required className={input} maxLength={75} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label className="text-[12px] text-pos-ink/60">Received on<input required type="date" className={input} value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></label>
              <label className="text-[12px] text-pos-ink/60">Identification number (26 characters, if allotted)<input className={`${input} font-mono uppercase`} maxLength={26} value={form.identificationNo} onChange={(e) => setForm({ ...form, identificationNo: e.target.value })} /></label>
              <label className="text-[12px] text-pos-ink/60">Nature of income<input className={input} maxLength={120} placeholder="e.g. Interest on fixed deposit" value={form.incomeNature} onChange={(e) => setForm({ ...form, incomeNature: e.target.value })} /></label>
              <label className="flex items-center gap-2 self-end text-[13px] text-pos-ink"><input type="checkbox" checked={form.seniorCitizen} onChange={(e) => setForm({ ...form, seniorCitizen: e.target.checked })} /> Senior citizen</label>
              <label className="text-[12px] text-pos-ink/60">Estimated income covered (₹)<input required inputMode="decimal" className={input} value={form.estimatedIncome} onChange={(e) => setForm({ ...form, estimatedIncome: e.target.value })} /></label>
              <label className="text-[12px] text-pos-ink/60">Estimated total income for the year (₹)<input required inputMode="decimal" className={input} value={form.estimatedTotalIncome} onChange={(e) => setForm({ ...form, estimatedTotalIncome: e.target.value })} /></label>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="rounded-full border border-pos-line px-4 py-2 text-[13px] text-pos-ink/70">Cancel</button>
                <button type="submit" className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white">Save declaration</button>
              </div>
            </form>
          )}
          <Card title={`Form 121 declarations, ${yearLabel}`} note="Declarations received from payees for no deduction. Rows with reason flag B are checked against this list. Withdrawn declarations stay on record." count={data.form121.length} empty="No declarations recorded for this year.">
            <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Payee</th><th className={th}>PAN</th><th className={th}>Received</th><th className={th}>Identification no.</th><th className={`${th} text-right`}>Income covered</th><th className={`${th} text-right`}>Total income</th><th className={th}></th></tr></thead>
              <tbody>{data.form121.map((f) => (
                <tr key={f.id} className={`border-t border-pos-line ${f.status === 'WITHDRAWN' ? 'opacity-50' : ''}`}>
                  <td className={td}>{f.name}{f.seniorCitizen ? <span className="ml-1.5 rounded-full bg-pos-tint px-2 py-0.5 text-[11px] text-pos-ink/60">Senior citizen</span> : null}</td>
                  <td className={`${td} font-mono`}>{f.pan}</td><td className={td}>{nice(f.receivedOn)}</td><td className={`${td} font-mono text-[12px]`}>{f.identificationNo ?? ''}</td>
                  <td className={num}>{inr(f.estimatedIncome)}</td><td className={num}>{inr(f.estimatedTotalIncome)}</td>
                  <td className={td}>{f.status === 'ACTIVE' ? <button type="button" onClick={() => withdraw(f.id)} className="text-[12px] text-pos-ink/55 hover:text-[#dc2626]">Withdraw</button> : 'Withdrawn'}</td>
                </tr>
              ))}</tbody></table>
          </Card>
        </>
      )}
    </div>
  );
}
