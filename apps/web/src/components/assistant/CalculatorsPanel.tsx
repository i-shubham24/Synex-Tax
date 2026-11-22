'use client';

import React, { useMemo, useState } from 'react';
import {
  advanceTax,
  capitalGain,
  gstCalc,
  incomeTaxBothRegimes,
  tdsCalc,
  FORM_140_SECTION_CODES,
  GST_RATES_EARLIER,
  GST_RATES_FROM_22_SEP_2025,
  RATES_2025,
  TAX_YEARS,
  type AssessmentYear,
  type AssetKind,
  type IncomeTaxResult,
} from '@synextax/tax-engine';
import { inputCls, inr } from './shared';

const num = (s: string) => s.replace(/[^0-9.]/g, '');
const yearLabel: Record<string, string> = { '2024-25': 'FY 2024-25', '2025-26': 'FY 2025-26', '2026-27': 'Tax Year 2026-27' };

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: 'text' | 'date' | 'money' }) {
  return (
    <label className="block text-[12px] text-pos-ink/60">{label}
      <input type={type === 'date' ? 'date' : 'text'} inputMode={type === 'money' ? 'decimal' : undefined} className={`${inputCls} ${type === 'money' ? 'text-right tabular-nums' : ''}`} value={value} onChange={(e) => onChange(type === 'money' ? num(e.target.value) : e.target.value)} />
    </label>
  );
}

function Rows({ rows }: { rows: Array<[string, string | number | null | undefined, boolean?]> }) {
  return (
    <div>
      {rows.map(([l, v, strong]) => (
        <div key={l} className={`flex justify-between py-1 text-[13px] ${strong ? 'font-semibold text-pos-ink' : 'text-pos-ink/75'}`}><span>{l}</span><span className="font-mono tabular-nums">{typeof v === 'string' && !/^-?\d/.test(v) ? v : inr(v)}</span></div>
      ))}
    </div>
  );
}

function IncomeTax() {
  const [year, setYear] = useState<AssessmentYear>('2026-27');
  const [age, setAge] = useState<'BELOW_60' | 'SENIOR' | 'SUPER_SENIOR'>('BELOW_60');
  const [v, setV] = useState({ salary: '', other: '', ded: '', nps: '', stcg: '', ltcg112A: '', ltcg112: '' });
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const r = useMemo(() => {
    const after = year !== '2024-25';
    const specialGains = [
      { amount: v.stcg, rate: 20, label: 'Short-term listed equity' },
      { amount: v.ltcg112A, rate: 12.5, label: 'Long-term listed equity above the exemption' },
      { amount: v.ltcg112, rate: 12.5, label: 'Other long-term gains' },
    ].filter((g) => Number(g.amount) > 0);
    return { res: incomeTaxBothRegimes({ year, ageBand: age, salary: v.salary, otherIncome: v.other, oldRegimeDeductions: v.ded, commonDeductions: v.nps, specialGains }), after };
  }, [year, age, v]);
  const col = (x: IncomeTaxResult) => (
    <div className={`rounded-[10px] border p-3 ${r.res.lower === x.regime ? 'border-pos-accent' : 'border-pos-line'}`}>
      <h4 className="mb-1 text-[14px] font-semibold text-pos-ink">{x.regime === 'NEW' ? 'New regime' : 'Old regime'}{r.res.lower === x.regime ? ' (lower)' : ''}</h4>
      <Rows rows={[['Income at slab rates', x.normalIncome], ['Gains at special rates', x.specialIncome], ['Total income', x.totalIncome, true], ['Tax at slab rates', x.taxOnNormal], ['Tax at special rates', x.taxOnSpecial], ['Rebate', x.rebate], ['Surcharge', x.surcharge], ['Cess', x.cess], ['Total tax', x.totalTax, true]]} />
      {x.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-pos-ink/55">{n}</p>)}
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] text-pos-ink/60">Year
            <select className={inputCls} value={year} onChange={(e) => setYear(e.target.value as AssessmentYear)}>{TAX_YEARS.map((y) => <option key={y} value={y}>{yearLabel[y]}</option>)}</select>
          </label>
          <label className="text-[12px] text-pos-ink/60">Age
            <select className={inputCls} value={age} onChange={(e) => setAge(e.target.value as typeof age)}><option value="BELOW_60">Below 60</option><option value="SENIOR">60 to 79</option><option value="SUPER_SENIOR">80 or more</option></select>
          </label>
        </div>
        <Field label="Gross salary" type="money" value={v.salary} onChange={set('salary')} />
        <Field label="Other income at slab rates" type="money" value={v.other} onChange={set('other')} />
        <Field label="Deductions allowed only in the old regime" type="money" value={v.ded} onChange={set('ded')} />
        <Field label="Employer NPS contribution" type="money" value={v.nps} onChange={set('nps')} />
        <Field label="Short-term gains on listed equity" type="money" value={v.stcg} onChange={set('stcg')} />
        <Field label="Long-term gains on listed equity, after the exemption" type="money" value={v.ltcg112A} onChange={set('ltcg112A')} />
        <Field label="Other long-term gains" type="money" value={v.ltcg112} onChange={set('ltcg112')} />
        {!r.after && <p className="text-[12px] text-pos-ink/55">FY 2024-25: gains here are taxed at the rates from 23 July 2024 (20% and 12.5%). For earlier sales use the capital gains calculator and enter the tax it gives.</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{col(r.res.NEW)}{col(r.res.OLD)}</div>
    </div>
  );
}

function CapitalGains() {
  const [v, setV] = useState({ kind: 'LISTED_EQUITY_STT' as AssetKind, acquiredOn: '', transferredOn: '', saleValue: '', cost: '', expenses: '', improvement: '', exemptionUsed: '', resident: true });
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  let r: ReturnType<typeof capitalGain> | null = null;
  let err = '';
  if (v.acquiredOn && v.transferredOn && v.saleValue) {
    try {
      r = capitalGain({ kind: v.kind, acquiredOn: v.acquiredOn, transferredOn: v.transferredOn, saleValue: v.saleValue, cost: v.cost, expenses: v.expenses, improvement: v.improvement, exemptionUsed: v.exemptionUsed, residentIndividualOrHuf: v.resident });
    } catch (e) {
      err = (e as Error).message;
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">
        <label className="block text-[12px] text-pos-ink/60">Asset
          <select className={inputCls} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as AssetKind })}>
            <option value="LISTED_EQUITY_STT">Listed equity or equity fund, STT paid</option>
            <option value="LAND_OR_BUILDING">Land or building</option>
            <option value="UNLISTED_SHARES">Unlisted shares</option>
            <option value="OTHER_LISTED_SECURITY">Other listed security</option>
            <option value="SPECIFIED_DEBT_FUND">Debt fund or market linked debenture</option>
            <option value="OTHER">Other asset (gold, jewellery and so on)</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2"><Field label="Bought on" type="date" value={v.acquiredOn} onChange={set('acquiredOn')} /><Field label="Sold on" type="date" value={v.transferredOn} onChange={set('transferredOn')} /></div>
        <Field label="Sale value" type="money" value={v.saleValue} onChange={set('saleValue')} />
        <Field label="Cost" type="money" value={v.cost} onChange={set('cost')} />
        <Field label="Cost of improvement" type="money" value={v.improvement} onChange={set('improvement')} />
        <Field label="Expenses on sale" type="money" value={v.expenses} onChange={set('expenses')} />
        {v.kind === 'LISTED_EQUITY_STT' && <Field label="Exemption already used this year" type="money" value={v.exemptionUsed} onChange={set('exemptionUsed')} />}
        {v.kind === 'LAND_OR_BUILDING' && <label className="flex items-center gap-2 text-[13px] text-pos-ink/70"><input type="checkbox" checked={v.resident} onChange={(e) => setV({ ...v, resident: e.target.checked })} /> Seller is a resident individual or HUF</label>}
      </div>
      <div className="rounded-[10px] border border-pos-line p-3">
        {err && <p className="text-[13px] text-[#dc2626]">{err}</p>}
        {!r && !err && <p className="text-[13px] text-pos-ink/50">Enter the dates and values.</p>}
        {r && (
          <>
            <Rows rows={[
              ['Holding', r.term === 'LONG' ? 'Long term' : 'Short term'],
              ['Rate from', r.section1961 === 'SLAB' ? 'Slab rates' : r.section1961 === '111A' ? '2025 Act section 196 / 1961 Act section 111A' : r.section1961 === '112A' ? '2025 Act section 198 / 1961 Act section 112A' : '2025 Act section 197 / 1961 Act section 112'],
              ['Gain', r.gain],
              ...(r.indexedCost ? [['Indexed cost', r.indexedCost] as [string, string]] : []),
              ['Exemption', r.exemption],
              ['Taxable gain', r.taxableGain, true],
              ['Rate', r.rate === null ? 'Slab rates' : `${r.rate}%`],
              ['Tax before surcharge and cess', r.tax ?? 'At slab rates', true],
            ]} />
            {r.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-pos-ink/55">{n}</p>)}
          </>
        )}
      </div>
    </div>
  );
}

function AdvanceTax() {
  const [v, setV] = useState({ fy: '2026', tax: '', tds: '', presumptive: false, senior: false, balanceOn: '', p1: '', d1: '', p2: '', d2: '', p3: '', d3: '', p4: '', d4: '' });
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  const fy = Number(v.fy);
  const r = useMemo(() => advanceTax({
    fyStart: fy,
    totalTax: v.tax,
    tdsTcs: v.tds,
    presumptive: v.presumptive,
    seniorWithoutBusiness: v.senior,
    balancePaidOn: v.balanceOn || undefined,
    payments: [[v.d1, v.p1], [v.d2, v.p2], [v.d3, v.p3], [v.d4, v.p4]].filter(([d, p]) => d && p).map(([date, amount]) => ({ date, amount })),
  }), [fy, v]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">
        <label className="block text-[12px] text-pos-ink/60">Year
          <select className={inputCls} value={v.fy} onChange={(e) => setV({ ...v, fy: e.target.value })}><option value="2024">FY 2024-25</option><option value="2025">FY 2025-26</option><option value="2026">Tax Year 2026-27</option></select>
        </label>
        <Field label="Tax for the year (with surcharge and cess)" type="money" value={v.tax} onChange={set('tax')} />
        <Field label="TDS and TCS" type="money" value={v.tds} onChange={set('tds')} />
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/70"><input type="checkbox" checked={v.presumptive} onChange={(e) => setV({ ...v, presumptive: e.target.checked })} /> Presumptive business or profession (one instalment)</label>
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/70"><input type="checkbox" checked={v.senior} onChange={(e) => setV({ ...v, senior: e.target.checked })} /> Resident senior citizen without business income</label>
        <p className="pt-1 text-[12px] text-pos-ink/60">Advance tax paid</p>
        {([['d1', 'p1'], ['d2', 'p2'], ['d3', 'p3'], ['d4', 'p4']] as const).map(([d, p]) => (
          <div key={d} className="grid grid-cols-2 gap-2"><Field label="Date" type="date" value={v[d]} onChange={set(d)} /><Field label="Amount" type="money" value={v[p]} onChange={set(p)} /></div>
        ))}
        <Field label="Balance paid on (for interest on short payment)" type="date" value={v.balanceOn} onChange={set('balanceOn')} />
      </div>
      <div className="rounded-[10px] border border-pos-line p-3">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-pos-ink/60"><th className="py-1 font-medium">Due by</th><th className="font-medium">Cumulative</th><th className="text-right font-medium">Due</th><th className="text-right font-medium">Paid</th><th className="text-right font-medium">Interest</th></tr></thead>
          <tbody>
            {r.instalments.map((i) => (
              <tr key={i.dueDate} className="border-t border-pos-line"><td className="py-1 font-mono">{i.dueDate}</td><td>{i.cumulativePercent}%</td><td className="text-right font-mono">{inr(i.due)}</td><td className="text-right font-mono">{inr(i.paidByDate)}</td><td className="text-right font-mono">{inr(i.interest234C)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3">
          <Rows rows={[['Tax after TDS and TCS', r.assessedTax], ['Interest for deferment (2025 Act section 425 / 1961 Act section 234C)', r.interest234C, true], [`Interest for short payment, ${r.months234B} months (2025 Act section 424 / 1961 Act section 234B)`, r.interest234B, true]]} />
        </div>
        {r.notes.map((n) => <p key={n} className="mt-1 text-[12px] text-pos-ink/55">{n}</p>)}
        <p className="mt-2 text-[12px] text-pos-ink/55">Relief for capital gains or new business income arising after an instalment date is not worked out here.</p>
      </div>
    </div>
  );
}

function Gst() {
  const [v, setV] = useState({ amount: '', rate: '18', mode: 'NET' as 'NET' | 'GROSS', inter: false });
  let r: ReturnType<typeof gstCalc> | null = null;
  try {
    r = v.amount ? gstCalc({ amount: v.amount, rate: Number(v.rate), mode: v.mode, interState: v.inter }) : null;
  } catch {
    r = null;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">
        <Field label="Amount" type="money" value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] text-pos-ink/60">Amount is
            <select className={inputCls} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as 'NET' | 'GROSS' })}><option value="NET">Before GST</option><option value="GROSS">Including GST</option></select>
          </label>
          <label className="text-[12px] text-pos-ink/60">Rate
            <select className={inputCls} value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })}>
              <optgroup label="From 22 September 2025">{GST_RATES_FROM_22_SEP_2025.map((x) => <option key={x} value={x}>{x}%</option>)}</optgroup>
              <optgroup label="Earlier, or tobacco goods">{GST_RATES_EARLIER.map((x) => <option key={x} value={x}>{x}%</option>)}</optgroup>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/70"><input type="checkbox" checked={v.inter} onChange={(e) => setV({ ...v, inter: e.target.checked })} /> Between States (IGST)</label>
        <p className="text-[12px] text-pos-ink/55">Rates as notified from 22 September 2025 (Notifications 9/2025 and 15/2025, Central Tax (Rate)). The rate for an item comes from those notifications.</p>
      </div>
      <div className="rounded-[10px] border border-pos-line p-3">
        {r ? <Rows rows={[['Taxable value', r.taxableValue], ['CGST', r.cgst], ['SGST', r.sgst], ['IGST', r.igst], ['Total GST', r.totalTax, true], ['Value with GST', r.grossValue, true]]} /> : <p className="text-[13px] text-pos-ink/50">Enter an amount.</p>}
        {r?.rateNote && <p className="mt-1 text-[12px] text-pos-ink/55">{r.rateNote}</p>}
      </div>
    </div>
  );
}

function Tds() {
  const codes = FORM_140_SECTION_CODES.filter((c) => RATES_2025[c.code]);
  const [v, setV] = useState({ code: '1023', amount: '', ytd: '', company: false });
  let r: ReturnType<typeof tdsCalc> | null = null;
  try {
    r = v.amount ? tdsCalc({ code: v.code, amount: v.amount, yearToDate: v.ytd, payeeIsCompany: v.company }) : null;
  } catch {
    r = null;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="space-y-2">
        <label className="block text-[12px] text-pos-ink/60">Payment (Form 140 code)
          <select className={inputCls} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })}>{codes.map((c) => <option key={c.code} value={c.code}>{c.code}: {RATES_2025[c.code].nature}</option>)}</select>
        </label>
        <Field label="This payment" type="money" value={v.amount} onChange={(x) => setV({ ...v, amount: x })} />
        <Field label="Paid to this payee earlier this year" type="money" value={v.ytd} onChange={(x) => setV({ ...v, ytd: x })} />
        <label className="flex items-center gap-2 text-[13px] text-pos-ink/70"><input type="checkbox" checked={v.company} onChange={(e) => setV({ ...v, company: e.target.checked })} /> Payee is a company</label>
        <p className="text-[12px] text-pos-ink/55">Tax Year 2026-27 rates for residents with a valid PAN, from the Department&apos;s rate chart. Without a PAN a higher rate applies; it is not worked out here.</p>
      </div>
      <div className="rounded-[10px] border border-pos-line p-3">
        {r ? (
          <Rows rows={[['2025 Act', `section ${r.section2025}`], ['1961 Act', r.section1961 ? `section ${r.section1961}` : 'Not in the mapping table'], ['Threshold', r.threshold], ['Rate', `${r.rate}%`], ['Tax to deduct', r.applies === false ? 'Nil, below the threshold' : r.tax, true]]} />
        ) : <p className="text-[13px] text-pos-ink/50">Enter the payment.</p>}
      </div>
    </div>
  );
}

const CALCS = [
  ['income', 'Income tax', IncomeTax],
  ['gains', 'Capital gains', CapitalGains],
  ['advance', 'Advance tax and interest', AdvanceTax],
  ['gst', 'GST', Gst],
  ['tds', 'TDS by section', Tds],
] as const;

/** Calculators from the tax engine, in the browser. Workings for the CA to check. */
export function CalculatorsPanel() {
  const [which, setWhich] = useState<(typeof CALCS)[number][0]>('income');
  const Active = CALCS.find((c) => c[0] === which)![2];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CALCS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setWhich(id)} className={`rounded-[10px] px-3 py-1.5 text-[13px] font-medium ${which === id ? 'bg-pos-tint text-pos-ink ring-1 ring-pos-accent' : 'bg-pos-muted text-pos-ink/70 hover:text-pos-ink'}`}>{label}</button>
        ))}
      </div>
      <div className="pos-card p-4"><Active /></div>
    </div>
  );
}
