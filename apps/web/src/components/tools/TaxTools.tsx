'use client';

import React, { useMemo, useState, type ReactNode } from 'react';
import {
  GSTN_STATE_CODES,
  gstDueDate,
  gstReturnBarDate,
  lateFilingFee,
  tdsCorrectionDeadline,
  tdsInterest,
  tdsStatementDueDate,
  validateGstin,
  validatePan,
  salaryTds,
  type TdsForm,
} from '@synextax/tax-engine';

const field =
  'h-11 w-full rounded-full border border-ink/10 bg-white px-4 text-[14.5px] text-ink outline-none transition-shadow focus:border-sky focus:shadow-[0_0_0_4px_rgba(82,176,248,0.18)]';
const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function Card({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-24 rounded-[28px] border border-ink/[0.07] bg-white p-6 sm:p-8">
      <h2 id={`${id}-t`} className="font-display text-[22px] font-medium tracking-[-0.03em] text-ink">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-[1.6] text-ink/60">{intro}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink/55">{text}</span>
      {children}
    </label>
  );
}

function Result({ rows }: { rows: Array<[string, ReactNode, boolean?]> }) {
  return (
    <dl role="status" className="mt-6 divide-y divide-ink/[0.07] rounded-[20px] bg-mist px-5">
      {rows.map(([k, v, strong]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-3">
          <dt className="text-[13.5px] text-ink/60">{k}</dt>
          <dd className={`text-right tabular-nums ${strong ? 'font-display text-[18px] font-semibold text-ink' : 'text-[14.5px] text-ink'}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATES = Object.entries(GSTN_STATE_CODES).filter(([c]) => Number(c) <= 38);

function GstDueDates() {
  const [type, setType] = useState<'GSTR1' | 'IFF' | 'GSTR3B'>('GSTR3B');
  const [period, setPeriod] = useState('2026-10');
  const [cadence, setCadence] = useState<'MONTHLY' | 'QRMP'>('MONTHLY');
  const [state, setState] = useState('03');
  const out = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(period)) return null;
    try {
      const due = gstDueDate(type, period, type === 'IFF' ? 'QRMP' : cadence, state);
      return { due, bar: gstReturnBarDate(due) };
    } catch {
      return null;
    }
  }, [type, period, cadence, state]);
  return (
    <Card id="gst-due" title="GST due dates" intro="When a return is due for a period, and when it becomes time-barred three years later.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Return">
          <select className={field} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="GSTR1">GSTR-1</option>
            <option value="IFF">IFF (QRMP)</option>
            <option value="GSTR3B">GSTR-3B</option>
          </select>
        </Label>
        <Label text="Tax period (month)">
          <input type="month" className={field} value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Label>
        <Label text="Filing scheme">
          <select className={field} value={type === 'IFF' ? 'QRMP' : cadence} disabled={type === 'IFF'} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
            <option value="MONTHLY">Monthly</option>
            <option value="QRMP">Quarterly (QRMP)</option>
          </select>
        </Label>
        <Label text="State of the GSTIN">
          <select className={field} value={state} onChange={(e) => setState(e.target.value)}>
            {STATES.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}
          </select>
        </Label>
      </div>
      {out && <Result rows={[['Due on', nice(out.due), true], ['Can no longer be filed after', nice(out.bar)]]} />}
      <p className="mt-3 text-[12.5px] text-ink/45">QRMP returns are due for the last month of each quarter. Extensions notified by CBIC are not included.</p>
    </Card>
  );
}

const FORMS: Array<[TdsForm, string]> = [
  ['140', 'Form 140 (non-salary, 2025 Act)'],
  ['138', 'Form 138 (salary, 2025 Act)'],
  ['144', 'Form 144 (non-residents, 2025 Act)'],
  ['143', 'Form 143 (TCS, 2025 Act)'],
  ['26Q', '26Q (1961 Act)'],
  ['24Q', '24Q (1961 Act)'],
  ['27Q', '27Q (1961 Act)'],
  ['27EQ', '27EQ (1961 Act)'],
];

function TdsDueDates() {
  const [form, setForm] = useState<TdsForm>('140');
  const [year, setYear] = useState(2026);
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(3);
  const due = tdsStatementDueDate(form, year, quarter);
  return (
    <Card id="tds-due" title="TDS statement due dates" intro="When a quarterly statement is due, and until when it can be corrected.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Label text="Form">
          <select className={field} value={form} onChange={(e) => setForm(e.target.value as TdsForm)}>
            {FORMS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
          </select>
        </Label>
        <Label text="Year starting April">
          <select className={field} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}-{String((y + 1) % 100).padStart(2, '0')}</option>)}
          </select>
        </Label>
        <Label text="Quarter">
          <select className={field} value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}>
            <option value={1}>Q1 Apr to Jun</option>
            <option value={2}>Q2 Jul to Sep</option>
            <option value={3}>Q3 Oct to Dec</option>
            <option value={4}>Q4 Jan to Mar</option>
          </select>
        </Label>
      </div>
      <Result rows={[['Statement due on', nice(due), true], ['Corrections allowed until', nice(tdsCorrectionDeadline(due))]]} />
    </Card>
  );
}

function LateFee() {
  const [due, setDue] = useState('2027-01-31');
  const [filed, setFiled] = useState('2027-02-20');
  const [tds, setTds] = useState('27400');
  const days = Math.max(0, Math.round((Date.parse(filed) - Date.parse(due)) / 86400000));
  const fee = Number.isFinite(days) ? lateFilingFee(due, filed, Number(tds) || 0) : 0;
  return (
    <Card id="late-fee" title="Late filing fee" intro="₹200 for every day a TDS or TCS statement is late, never more than the tax in the statement (section 234E, section 427 of the 2025 Act).">
      <div className="grid gap-3 sm:grid-cols-3">
        <Label text="Due date"><input type="date" className={field} value={due} onChange={(e) => setDue(e.target.value)} /></Label>
        <Label text="Filed on"><input type="date" className={field} value={filed} onChange={(e) => setFiled(e.target.value)} /></Label>
        <Label text="Tax in the statement (₹)"><input inputMode="decimal" className={field} value={tds} onChange={(e) => setTds(e.target.value.replace(/[^\d.]/g, ''))} /></Label>
      </div>
      <Result rows={[['Days late', days], ['Fee', inr(fee), true]]} />
    </Card>
  );
}

function Interest() {
  const [tax, setTax] = useState('12345');
  const [deductible, setDeductible] = useState('2026-05-10');
  const [deducted, setDeducted] = useState('2026-05-10');
  const [deposited, setDeposited] = useState('2026-06-20');
  const r = useMemo(() => {
    try {
      return tdsInterest({ tax: tax || 0, deductibleOn: deductible, deductedOn: deducted, depositedOn: deposited });
    } catch {
      return null;
    }
  }, [tax, deductible, deducted, deposited]);
  return (
    <Card id="interest" title="Interest on late TDS" intro="1% a month for deducting late and 1.5% a month for paying late, on the tax rounded down to the hundred. A part of a month counts as a month.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Label text="Tax (₹)"><input inputMode="decimal" className={field} value={tax} onChange={(e) => setTax(e.target.value.replace(/[^\d.]/g, ''))} /></Label>
        <Label text="Should have been deducted on"><input type="date" className={field} value={deductible} onChange={(e) => setDeductible(e.target.value)} /></Label>
        <Label text="Deducted on"><input type="date" className={field} value={deducted} onChange={(e) => setDeducted(e.target.value)} /></Label>
        <Label text="Paid to the government on"><input type="date" className={field} value={deposited} onChange={(e) => setDeposited(e.target.value)} /></Label>
      </div>
      {r && (
        <Result
          rows={[
            ['Interest base', inr(r.base)],
            [`Late deduction, ${r.lateDeductionMonths} month${r.lateDeductionMonths === 1 ? '' : 's'} at 1%`, inr(r.lateDeductionInterest)],
            [`Late payment, ${r.lateDepositMonths} month${r.lateDepositMonths === 1 ? '' : 's'} at 1.5% (due ${nice(r.depositDueOn)})`, inr(r.lateDepositInterest)],
            ['Total interest', inr(r.total), true],
          ]}
        />
      )}
    </Card>
  );
}

const PAN_TYPES: Record<string, string> = { C: 'Company', P: 'Individual', H: 'HUF', F: 'Firm or LLP', A: 'AOP', T: 'Trust', B: 'BOI', L: 'Local authority', J: 'Artificial juridical person', G: 'Government' };

function GstinCheck() {
  const [value, setValue] = useState('');
  const g = value.trim().toUpperCase();
  const v = g.length === 15 ? validateGstin(g) : null;
  const pan = g.slice(2, 12);
  return (
    <Card id="gstin" title="GSTIN checker" intro="Checks the format and the check digit, and reads the state, PAN and holder type from a GSTIN. Nothing is sent anywhere.">
      <Label text="GSTIN">
        <input className={`${field} font-mono uppercase`} maxLength={15} value={value} onChange={(e) => setValue(e.target.value)} placeholder="03AAFCP4821K1Z?" spellCheck={false} />
      </Label>
      {g.length > 0 && g.length < 15 && <p className="mt-3 text-[13.5px] text-ink/55">{15 - g.length} more characters.</p>}
      {v && (
        v.isValid ? (
          <Result rows={[['Result', <span key="ok" className="text-[#147a3a]">Valid GSTIN</span>, true], ['State', `${v.stateCode} ${v.stateName}`], ['PAN', pan], ['Holder', validatePan(pan).isValid ? PAN_TYPES[pan[3]] ?? 'Other' : 'Unknown']]} />
        ) : (
          <p role="alert" className="mt-4 rounded-[16px] bg-[#dc2626]/10 px-4 py-3 text-[14px] text-[#b91c1c]">
            {v.error?.includes('checksum') ? 'The check digit does not match: a character is probably mistyped.' : v.error}
          </p>
        )
      )}
    </Card>
  );
}


function SalaryTds() {
  const [v, setV] = useState({ gross: '1800000', basic: '900000', hra: '360000', rent: '300000', metro: false, c80: '150000', other: '25000', nps: '0', done: '0', months: '5', perq: '0', prevSalary: '0', prevTds: '0', lta: '0', homeLoan: '0' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value.replace(/[^\d.]/g, '') });
  const r = useMemo(
    () =>
      salaryTds({
        grossSalary: v.gross || 0, basicPlusDa: v.basic || 0, hraReceived: v.hra || 0, rentPaid: v.rent || 0, metroCity: v.metro,
        section80C: v.c80 || 0, otherDeductions: v.other || 0, employerNps: v.nps || 0, professionalTax: 2500,
        tdsAlreadyDeducted: v.done || 0, monthsRemaining: Number(v.months) || 12,
        perquisites: v.perq || 0, previousEmployer: { salary: v.prevSalary || 0, tds: v.prevTds || 0 }, ltaExempt: v.lta || 0, homeLoanInterest: v.homeLoan || 0,
      }),
    [v],
  );
  const num = (label: string, k: keyof typeof v) => (
    <Label text={label}><input inputMode="decimal" className={field} value={String(v[k])} onChange={set(k)} /></Label>
  );
  return (
    <Card id="salary" title="Salary TDS, old and new regime" intro="Tax on a year's salary under both regimes, and what to deduct each month for the rest of the year. Tax Year 2026-27 rates, which the Finance Act 2026 left unchanged; confirm before relying on it.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {num('Gross salary for the year (₹)', 'gross')}
        {num('Basic + DA (₹)', 'basic')}
        {num('HRA received (₹)', 'hra')}
        {num('Rent paid (₹)', 'rent')}
        {num('80C investments (₹)', 'c80')}
        {num('Other old-regime deductions (₹)', 'other')}
        {num('Employer NPS (₹)', 'nps')}
        {num('TDS already deducted (₹)', 'done')}
        {num('Months left incl. this one', 'months')}
        {num('Perquisites, taxable value (₹)', 'perq')}
        {num('Salary from earlier employer (₹)', 'prevSalary')}
        {num('TDS by earlier employer (₹)', 'prevTds')}
        {num('LTA exempt, old regime (₹)', 'lta')}
        {num('Home-loan interest, old regime (₹)', 'homeLoan')}
        <label className="flex items-center gap-2 self-end pb-3 text-[13.5px] text-ink/70">
          <input type="checkbox" checked={v.metro} onChange={set('metro')} className="h-4 w-4 accent-[#2f8ae0]" /> Rent in a metro city
        </label>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(['NEW', 'OLD'] as const).map((k) => (
          <div key={k} className={`rounded-[20px] px-5 py-4 ${r.lower === k ? 'bg-mint/15 ring-1 ring-mint' : 'bg-mist'}`}>
            <p className="font-display text-[15px] font-medium text-ink">{k === 'NEW' ? 'New regime (default)' : 'Old regime'}{r.lower === k ? ', lower tax' : ''}</p>
            <dl className="mt-2 space-y-1.5 text-[13.5px]">
              {[['Taxable income', r[k].taxableIncome], ['Tax on slabs', r[k].slabTax], ['Rebate (section 156)', r[k].rebate], ['Surcharge', r[k].surcharge], ['Cess 4%', r[k].cess]].map(([a, b]) => (
                <div key={a} className="flex justify-between gap-3"><dt className="text-ink/60">{a}</dt><dd className="tabular-nums text-ink">{inr(b)}</dd></div>
              ))}
              <div className="flex justify-between gap-3 border-t border-ink/10 pt-2"><dt className="font-medium text-ink">Tax for the year</dt><dd className="font-display text-[17px] font-semibold tabular-nums text-ink">{inr(r[k].totalTax)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink/60">Deduct each month from now</dt><dd className="tabular-nums text-ink">{inr(r[k].monthlyTds)}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-ink/45">Professional tax of ₹2,500 is assumed under the old regime. Income other than salary is not included; claims need the evidence Form 124 asks for (the landlord’s PAN above ₹1 lakh rent, the lender’s details for home-loan interest).</p>
    </Card>
  );
}

export function TaxTools() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <GstDueDates />
      <TdsDueDates />
      <LateFee />
      <GstinCheck />
      <div className="lg:col-span-2">
        <Interest />
      </div>
      <div className="lg:col-span-2">
        <SalaryTds />
      </div>
    </div>
  );
}
