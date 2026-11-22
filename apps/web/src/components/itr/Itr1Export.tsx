'use client';

import React, { useEffect, useState } from 'react';
import { FileJson } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-[13px] text-pos-ink outline-none focus:border-pos-accent';
const num = (v: string | undefined) => (v ? Number(v) : undefined);

const DETAILS: Array<[key: string, label: string, type?: string]> = [
  ['firstName', 'First name'], ['surname', 'Surname'], ['pan', 'PAN'], ['dob', 'Date of birth', 'date'],
  ['fatherName', "Father's name"], ['mobile', 'Mobile'], ['email', 'Email', 'email'], ['residenceNo', 'Flat or house number'],
  ['locality', 'Area or locality'], ['city', 'City or district'], ['stateCode', 'State code (e.g. 26 Punjab)'], ['pin', 'PIN code'],
  ['place', 'Place of signing'], ['employerTan', 'Employer TAN'], ['employerName', 'Employer name'], ['salaryTds', 'TDS on salary'],
  ['bankIfsc', 'Bank IFSC'], ['bankName', 'Bank name'], ['bankAccount', 'Account number'], ['interest234C', 'Interest under 234C (from the utility)'],
];

/**
 * ITR-1 JSON for Assessment Year 2026-27 (income of 2025-26), from the figures on this page and the
 * details below. Written on the server to the Department's schema; the user uploads it on the
 * e-filing portal. The PAN, account number and other details are sent once and not stored.
 */
export function Itr1Export({ values, age }: { values: Record<string, string>; age: string }) {
  const { authFetch } = useAuth();
  const [d, setD] = useState<Record<string, string>>({ stateCode: '', employerCategory: 'OTH' });
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    authFetch('/api/v1/itr/itr1/status').then(async (r) => setConfigured(r.ok ? (await r.json()).softwareIdConfigured : false));
  }, [authFetch]);

  const v = (k: string) => values[k] || undefined;
  const make = async () => {
    setIssues([]); setError(null); setSummary(null);
    const salaryGross = num(v('salary.gross'));
    const body = {
      ageBand: age,
      person: {
        firstName: d.firstName || undefined, surname: d.surname ?? '', pan: (d.pan ?? '').toUpperCase(), dob: d.dob ?? '', employerCategory: d.employerCategory,
        address: { residenceNo: d.residenceNo ?? '', locality: d.locality ?? '', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' },
        mobile: d.mobile ?? '', email: d.email ?? '', fatherName: d.fatherName ?? '', place: d.place ?? '',
      },
      filing: { section, regime },
      salary: salaryGross ? { gross: salaryGross, professionalTax: num(v('salary.professionalTax')), employers: d.employerTan ? [{ tan: d.employerTan.toUpperCase(), name: d.employerName ?? '', incomeChargeable: Math.max(0, salaryGross - (regime === 'NEW' ? 75000 : 50000) - (regime === 'OLD' ? Math.min(Number(v('salary.professionalTax') ?? 0), 2500) : 0)), tds: Number(d.salaryTds || 0) }] : [] } : undefined,
      house: v('house.rent') || v('house.selfOccupiedInterest') ? { letOut: !!v('house.rent'), address: d.residenceNo ? `${d.residenceNo}, ${d.locality ?? ''}`.slice(0, 50) : 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '', rent: num(v('house.rent')), municipalTax: num(v('house.municipalTax')), interest: num(v('house.rent') ? v('house.interest') : v('house.selfOccupiedInterest')) } : undefined,
      otherSources: { savingsInterest: num(v('otherSources.savingsInterest')), depositInterest: num(v('otherSources.depositInterest')), dividends: num(v('otherSources.dividends')), other: num(v('otherSources.other')) },
      ltcg112A: v('capitalGains.equityLongTerm') ? { saleValue: Number(v('capitalGains.equityLongTerm')), cost: 0 } : undefined,
      deductions: { section80C: num(v('deductions.section80C')), section80D: num(v('deductions.healthInsurance')), section80CCD1B: num(v('deductions.npsSelf')) },
      tcs: num(v('taxesPaid.tcs')),
      interest234C: num(d.interest234C),
      bank: { ifsc: (d.bankIfsc ?? '').toUpperCase(), name: d.bankName ?? '', account: d.bankAccount ?? '', type: 'SB' },
    };
    const r = await authFetch('/api/v1/itr/itr1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    if (b.summary) setSummary(b.summary);
    if (r.status === 422) return setIssues(b.issues ?? []);
    if (!r.ok) return setError(b.message ?? 'Not prepared.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(b.json)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = b.fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const ineligible = ['business.digitalTurnover', 'business.otherTurnover', 'business.professionalReceipts', 'capitalGains.equityShortTerm', 'capitalGains.otherLongTerm', 'capitalGains.otherShortTerm', 'salary.hraReceived'].filter((k) => Number(values[k] || 0) > 0);

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-1 return file, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/65">For income of 2025-26: salary, one house property, interest and other income, and listed equity gains up to ₹1.25 lakh. The file follows the Department&apos;s ITR-1 schema (version 1.1 of 30 Jun 2026) and is uploaded on the e-filing portal. The figures above are used as entered; long-term equity gains count as the gain.</p>
      {configured === false && <p className="rounded-[10px] bg-[#b45309]/10 px-3 py-2 text-[13px] text-[#b45309]">The schema needs the software ID the Department issues to a registered e-return intermediary. Set ITR_SOFTWARE_ID on the server once the firm is registered; until then the file is checked but not written.</p>}
      {ineligible.length > 0 && <p className="text-[13px] text-[#dc2626]">ITR-1 does not cover business income, short-term gains, other long-term gains or HRA exemption entered above; use ITR-2, ITR-3 or ITR-4.</p>}
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
        <label className="flex items-center gap-2">Regime
          <select value={regime} onChange={(e) => setRegime(e.target.value as 'NEW' | 'OLD')} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink"><option value="NEW">New</option><option value="OLD">Old (opting out)</option></select>
        </label>
        <label className="flex items-center gap-2">Return
          <select value={section} onChange={(e) => setSection(Number(e.target.value) as 11 | 12 | 17)} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink"><option value={11}>On time, 139(1)</option><option value={12}>Belated, 139(4)</option><option value={17}>Revised, 139(5)</option></select>
        </label>
        <label className="flex items-center gap-2">Employer
          <select value={d.employerCategory} onChange={(e) => setD({ ...d, employerCategory: e.target.value })} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
            {[['OTH', 'Others'], ['CGOV', 'Central Government'], ['SGOV', 'State Government'], ['PSU', 'Public sector'], ['PE', 'Pensioner, Central Govt'], ['PESG', 'Pensioner, State Govt'], ['PEPS', 'Pensioner, PSU'], ['PEO', 'Pensioner, others'], ['NA', 'Not applicable']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {DETAILS.map(([k, label, type]) => (
          <label key={k} className="text-[12px] text-pos-ink/60">{label}
            <input type={type ?? 'text'} value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value })} className={input} autoComplete="off" />
          </label>
        ))}
      </div>
      <button type="button" onClick={make} disabled={ineligible.length > 0} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-1 JSON' : 'Check ITR-1'}</button>
      {error && <p className="text-[13px] text-[#dc2626]">{error}</p>}
      {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#dc2626]">{issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      {summary && <p className="text-[13px] text-pos-ink/70">Total income ₹{summary.totalIncome?.toLocaleString('en-IN')}, tax ₹{summary.tax?.toLocaleString('en-IN')}, interest and fee ₹{summary.interest?.toLocaleString('en-IN')}, {summary.refund ? `refund ₹${summary.refund.toLocaleString('en-IN')}` : `to pay ₹${(summary.payable ?? 0).toLocaleString('en-IN')}`}.</p>}
    </section>
  );
}
