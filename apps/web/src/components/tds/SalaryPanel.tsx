'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { SalaryRegisterLine } from '@synextax/tax-engine';
import { useAuth } from '../../context/AuthContext';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const th = 'px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap';
const td = 'px-3 py-2 text-[13px] text-pos-ink';
const num = `${td} text-right tabular-nums`;

const BLANK = {
  pan: '', name: '', regime: 'NEW', ageBand: 'BELOW_60', metroCity: false, monthlyGross: '', monthlyBasicDa: '', monthlyHra: '', monthlyEmployerNps: '', annualPerquisites: '', professionalTax: '', joinedOn: '',
  prevSalary: '', prevTds: '',
  rent: '', landlordName: '', landlordAddress: '', landlordPan: '', lta: '', ltaEvidence: false,
  homeLoan: '', lenderName: '', lenderAddress: '', lenderPan: '', lenderIsInstitution: true, c80: '', d80: '',
};

/** Salary register for a TAN: tax for the year, TDS so far, monthly TDS, and each Form 124 claim checked. */
export function SalaryPanel({ tan }: { tan: string }) {
  const { authFetch } = useAuth();
  const thisYear = new Date().getUTCMonth() >= 3 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const [year, setYear] = useState(Math.max(2026, thisYear));
  const [lines, setLines] = useState<SalaryRegisterLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tan) return;
    const r = await authFetch(`/api/v1/tds/salary?tan=${tan}&year=${year}`);
    if (r.ok) setLines((await r.json()).register);
  }, [authFetch, tan, year]);
  useEffect(() => { load(); }, [load]);

  const n = (v: string) => Number(v || 0);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const form124 = {
      employeeName: f.name, employeePan: f.pan.toUpperCase(), taxYear: year, regime: f.regime,
      ...(n(f.rent) ? { rent: { annual: n(f.rent), landlordName: f.landlordName, landlordAddress: f.landlordAddress, landlordPan: f.landlordPan.toUpperCase(), evidence: true } } : {}),
      ...(n(f.lta) ? { lta: { amount: n(f.lta), evidence: f.ltaEvidence } } : {}),
      ...(n(f.homeLoan) ? { homeLoan: { interest: n(f.homeLoan), lenderName: f.lenderName, lenderAddress: f.lenderAddress, lenderPan: f.lenderPan.toUpperCase(), lenderIsInstitution: f.lenderIsInstitution, evidence: true } } : {}),
      chapterVIA: [...(n(f.c80) ? [{ section: '80C', amount: n(f.c80), evidence: true }] : []), ...(n(f.d80) ? [{ section: '80D', amount: n(f.d80), evidence: true }] : [])],
    };
    const r = await authFetch('/api/v1/tds/salary/employees', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tan, taxYear: year, pan: f.pan.toUpperCase(), name: f.name, regime: f.regime, ageBand: f.ageBand, metroCity: f.metroCity,
        monthlyGross: n(f.monthlyGross), monthlyBasicDa: n(f.monthlyBasicDa), monthlyHra: n(f.monthlyHra), monthlyEmployerNps: n(f.monthlyEmployerNps), annualPerquisites: n(f.annualPerquisites),
        professionalTax: n(f.professionalTax), joinedOn: f.joinedOn, previousEmployer: n(f.prevSalary) ? { salary: n(f.prevSalary), tds: n(f.prevTds) } : undefined, form124,
      }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return setError(b.message ?? 'Not saved.');
    setAdding(false);
    setF(BLANK);
    load();
  };
  const text = (k: keyof typeof BLANK, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-[12px] text-pos-ink/60">{label}<input className={input} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );
  const amount = (k: keyof typeof BLANK, label: string) => text(k, label, { inputMode: 'decimal' });

  if (!tan) return <p className="pos-card px-4 py-4 text-[13px] text-pos-ink/55">Choose a TAN above to see its salary register.</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/60">Tax year
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-full border border-pos-line bg-pos-surface px-3 py-1.5 text-pos-ink">{[0, 1].map((i) => Math.max(2026, thisYear) - i).filter((y) => y >= 2026).map((y) => <option key={y} value={y}>TY {y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}</select>
        </label>
        <button type="button" onClick={() => setAdding(!adding)} className="inline-flex items-center gap-1.5 rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white"><Plus className="h-4 w-4" /> Add an employee</button>
      </div>

      {adding && (
        <form onSubmit={save} className="pos-card space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {text('name', 'Name', { required: true, maxLength: 75 })}
            {text('pan', 'PAN (or PANNOTAVBL)', { required: true, maxLength: 10, className: `${input} font-mono uppercase` })}
            <label className="text-[12px] text-pos-ink/60">Regime<select className={input} value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value })}><option value="NEW">New (default)</option><option value="OLD">Old</option></select></label>
            <label className="text-[12px] text-pos-ink/60">Age<select className={input} value={f.ageBand} onChange={(e) => setF({ ...f, ageBand: e.target.value })}><option value="BELOW_60">Below 60</option><option value="SENIOR">60 to 79</option><option value="SUPER_SENIOR">80 or more</option></select></label>
            {amount('monthlyGross', 'Gross salary a month (₹)')}
            {amount('monthlyBasicDa', 'Basic + DA a month (₹)')}
            {amount('monthlyHra', 'HRA a month (₹)')}
            {amount('monthlyEmployerNps', 'Employer NPS a month (₹)')}
            {amount('annualPerquisites', 'Perquisites for the year (₹)')}
            {amount('professionalTax', 'Professional tax for the year (₹)')}
            {text('joinedOn', 'Joined on (if this year)', { type: 'date' })}
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-pos-ink"><input type="checkbox" checked={f.metroCity} onChange={(e) => setF({ ...f, metroCity: e.target.checked })} /> Lives in a metro city</label>
            {amount('prevSalary', 'Salary from earlier employer (₹)')}
            {amount('prevTds', 'TDS by earlier employer (₹)')}
          </div>
          <fieldset className="grid gap-3 border-t border-pos-line pt-3 sm:grid-cols-4">
            <legend className="text-[13px] font-semibold text-pos-ink">Form 124 claims (old regime)</legend>
            {amount('rent', 'Rent paid in the year (₹)')}
            {text('landlordName', 'Landlord’s name')}
            {text('landlordAddress', 'Landlord’s address')}
            {text('landlordPan', 'Landlord’s PAN (above ₹1 lakh)', { maxLength: 10, className: `${input} font-mono uppercase` })}
            {amount('lta', 'Leave travel claimed (₹)')}
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-pos-ink"><input type="checkbox" checked={f.ltaEvidence} onChange={(e) => setF({ ...f, ltaEvidence: e.target.checked })} /> Travel evidence received</label>
            {amount('homeLoan', 'Home-loan interest (₹)')}
            {text('lenderName', 'Lender’s name')}
            {text('lenderAddress', 'Lender’s address')}
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-pos-ink"><input type="checkbox" checked={f.lenderIsInstitution} onChange={(e) => setF({ ...f, lenderIsInstitution: e.target.checked })} /> Bank or financial institution</label>
            {!f.lenderIsInstitution && text('lenderPan', 'Lender’s PAN', { maxLength: 10, className: `${input} font-mono uppercase` })}
            {amount('c80', 'Investments under 80C (₹)')}
            {amount('d80', 'Health insurance, 80D (₹)')}
          </fieldset>
          {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="rounded-full border border-pos-line px-4 py-2 text-[13px]">Cancel</button><button type="submit" className="rounded-full bg-pos-accent px-4 py-2 text-[13px] font-medium text-white">Save employee</button></div>
        </form>
      )}

      <section className="pos-card overflow-x-auto">
        <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Salary register</h3>
        {lines.length ? (
          <table className="w-full"><thead className="text-pos-ink/55"><tr><th className={th}>Employee</th><th className={th}>Regime</th><th className={`${th} text-right`}>Months</th><th className={`${th} text-right`}>Gross for the year</th><th className={`${th} text-right`}>Taxable</th><th className={`${th} text-right`}>Tax for the year</th><th className={`${th} text-right`}>Other regime</th><th className={`${th} text-right`}>Deducted so far</th><th className={`${th} text-right`}>Each month now</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.id} className="border-t border-pos-line align-top">
                <td className={td}>{l.name} <span className="font-mono text-pos-ink/60">{l.pan}</span></td><td className={td}>{l.regime === 'NEW' ? 'New' : 'Old'}</td><td className={num}>{l.monthsWorked}</td>
                <td className={num}>{inr(l.annualGross)}</td><td className={num}>{inr(l.taxableIncome)}</td><td className={num}>{inr(l.annualTax)}</td>
                <td className={`${num} ${Number(l.otherRegimeTax) < Number(l.annualTax) ? 'text-[#b45309]' : 'text-pos-ink/60'}`}>{inr(l.otherRegimeTax)}</td>
                <td className={num}>{inr(Number(l.deductedSoFar) + Number(l.previousEmployerTds))}</td><td className={`${num} font-semibold`}>{inr(l.monthlyTds)}</td>
              </tr>
            ))}</tbody></table>
        ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">No employees on the register for this year yet.</p>}
      </section>

      <section className="pos-card overflow-x-auto">
        <h3 className="border-b border-pos-line px-4 py-3 text-[14px] font-semibold text-pos-ink">Form 124 report</h3>
        {lines.some((l) => l.form124.length) ? (
          <ul>{lines.flatMap((l) => l.form124.map((c, i) => (
            <li key={`${l.id}-${i}`} className="flex flex-wrap justify-between gap-2 border-t border-pos-line px-4 py-2.5 text-[13px] first:border-t-0">
              <span className="text-pos-ink">{l.name}, {c.claim}</span>
              <span className={c.level === 'error' ? 'text-[#dc2626]' : 'text-[#b45309]'}>{c.level === 'error' ? 'Held back: ' : ''}{c.message}</span>
            </li>
          )))}</ul>
        ) : <p className="px-4 py-4 text-[13px] text-pos-ink/55">Every claim has what it needs.</p>}
      </section>
    </div>
  );
}
