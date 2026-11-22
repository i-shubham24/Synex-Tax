'use client';

import React, { useMemo, useState } from 'react';
import { itrComputation, type ItrInput, type ItrRegimeResult } from '@synextax/tax-engine';
import { ItrFormPicker } from '../../../components/itr/ItrFormPicker';

const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const input = 'h-9 w-full rounded-[10px] border border-pos-line bg-pos-surface px-3 text-right text-[13px] tabular-nums text-pos-ink outline-none focus:border-pos-accent';

type Field = [key: string, label: string];
const GROUPS: Array<[string, Field[]]> = [
  ['Salary', [['salary.gross', 'Gross salary'], ['salary.basicPlusDa', 'Basic plus DA'], ['salary.hraReceived', 'HRA received'], ['salary.rentPaid', 'Rent paid'], ['salary.professionalTax', 'Professional tax'], ['salary.employerNps', 'Employer NPS']]],
  ['House property', [['house.rent', 'Rent received (let out)'], ['house.municipalTax', 'Municipal tax paid'], ['house.interest', 'Interest on let-out loan'], ['house.selfOccupiedInterest', 'Interest on own home loan']]],
  ['Business or profession', [['business.digitalTurnover', 'Turnover received digitally'], ['business.otherTurnover', 'Other turnover'], ['business.professionalReceipts', 'Professional receipts'], ['business.actualProfit', 'Actual profit (if not presumptive)']]],
  ['Capital gains', [['capitalGains.equityShortTerm', 'Listed equity, short term'], ['capitalGains.equityLongTerm', 'Listed equity, long term'], ['capitalGains.otherLongTerm', 'Other long term'], ['capitalGains.otherShortTerm', 'Other short term']]],
  ['Other sources', [['otherSources.savingsInterest', 'Savings bank interest'], ['otherSources.depositInterest', 'Deposit interest'], ['otherSources.dividends', 'Dividends'], ['otherSources.other', 'Other income']]],
  ['Deductions (old regime)', [['deductions.section80C', 'Investments under 80C'], ['deductions.npsSelf', 'Own NPS, additional'], ['deductions.healthInsurance', 'Health insurance'], ['deductions.other', 'Other deductions']]],
  ['Taxes paid', [['taxesPaid.tds', 'TDS'], ['taxesPaid.tcs', 'TCS'], ['taxesPaid.advanceTax', 'Advance tax'], ['taxesPaid.selfAssessment', 'Self-assessment tax']]],
];

function toInput(v: Record<string, string>, age: ItrInput['ageBand'], metro: boolean): ItrInput {
  const g = (k: string) => v[k] || undefined;
  return {
    ageBand: age,
    salary: g('salary.gross') ? { gross: v['salary.gross'], basicPlusDa: g('salary.basicPlusDa'), hraReceived: g('salary.hraReceived'), rentPaid: g('salary.rentPaid'), metroCity: metro, professionalTax: g('salary.professionalTax'), employerNps: g('salary.employerNps') } : undefined,
    house: { selfOccupiedInterest: g('house.selfOccupiedInterest'), letOut: g('house.rent') ? [{ rent: v['house.rent'], municipalTax: g('house.municipalTax'), interest: g('house.interest') }] : [] },
    business: { digitalTurnover: g('business.digitalTurnover'), otherTurnover: g('business.otherTurnover'), professionalReceipts: g('business.professionalReceipts'), actualProfit: g('business.actualProfit') },
    capitalGains: { equityShortTerm: g('capitalGains.equityShortTerm'), equityLongTerm: g('capitalGains.equityLongTerm'), otherLongTerm: g('capitalGains.otherLongTerm'), otherShortTerm: g('capitalGains.otherShortTerm') },
    otherSources: { savingsInterest: g('otherSources.savingsInterest'), depositInterest: g('otherSources.depositInterest'), dividends: g('otherSources.dividends'), other: g('otherSources.other') },
    deductions: { section80C: g('deductions.section80C'), npsSelf: g('deductions.npsSelf'), healthInsurance: g('deductions.healthInsurance'), other: g('deductions.other') },
    taxesPaid: { tds: g('taxesPaid.tds'), tcs: g('taxesPaid.tcs'), advanceTax: g('taxesPaid.advanceTax'), selfAssessment: g('taxesPaid.selfAssessment') },
  };
}

function Column({ r, best }: { r: ItrRegimeResult; best: boolean }) {
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between py-1 text-[13px] ${strong ? 'font-semibold text-pos-ink' : 'text-pos-ink/75'}`}><span>{label}</span><span className="tabular-nums">{inr(v)}</span></div>
  );
  const payable = Number(r.payable);
  return (
    <div className={`pos-card p-4 ${best ? 'ring-2 ring-pos-accent' : ''}`}>
      <h3 className="mb-2 text-[15px] font-semibold text-pos-ink">{r.regime === 'NEW' ? 'New regime' : 'Old regime'}{best ? <span className="ml-2 rounded-full bg-pos-accent px-2 py-0.5 text-[11px] text-white">Lower tax</span> : null}</h3>
      {row('Salary', r.heads.salary)}
      {row('House property', r.heads.houseProperty)}
      {row('Business or profession', r.heads.business)}
      {row('Capital gains at slab rates', r.heads.capitalGainsNormal)}
      {row('Capital gains at special rates', String(Number(r.specialRate.equityShortTerm) + Number(r.specialRate.equityLongTermTaxable) + Number(r.specialRate.otherLongTerm)))}
      {row('Other sources', r.heads.otherSources)}
      {row('Deductions', r.deductions)}
      {row('Total income', r.totalIncome, true)}
      <div className="my-2 border-t border-pos-line" />
      {row('Tax at slab rates', r.taxOnNormal)}
      {row('Tax at special rates', r.taxOnSpecial)}
      {row('Rebate', r.rebate)}
      {row('Surcharge', r.surcharge)}
      {row('Cess', r.cess)}
      {row('Total tax', r.totalTax, true)}
      {row('Taxes already paid', r.taxesPaid)}
      <div className={`mt-2 flex justify-between rounded-[10px] px-3 py-2 text-[14px] font-semibold ${payable > 0 ? 'bg-[#dc2626]/5 text-[#dc2626]' : 'bg-[#22a356]/10 text-[#15803d]'}`}>
        <span>{payable > 0 ? 'To pay' : payable < 0 ? 'Refund' : 'Nothing due'}</span><span className="tabular-nums">{inr(Math.abs(payable))}</span>
      </div>
      {r.notes.length > 0 && <ul className="mt-2 space-y-1 text-[12px] text-pos-ink/60">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}

/** Income tax computation for a resident individual, both regimes side by side. Nothing is saved. */
export default function ItrPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [age, setAge] = useState<ItrInput['ageBand']>('BELOW_60');
  const [metro, setMetro] = useState(false);
  const result = useMemo(() => itrComputation(toInput(values, age, metro)), [values, age, metro]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Income tax computation</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/60">A resident individual&apos;s tax for Tax Year 2026-27 under both regimes. Check it against the Income-tax Department&apos;s utility before filing. The Department has not yet published return schemas for Tax Year 2026-27; the return files below are for Assessment Year 2026-27 (income of 2025-26), whose slabs, rebate and standard deduction are the same.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,720px)]">
        <div className="space-y-3">
          <div className="pos-card flex flex-wrap gap-4 p-4 text-[13px] text-pos-ink/70">
            <label className="flex items-center gap-2">Age
              <select value={age} onChange={(e) => setAge(e.target.value as ItrInput['ageBand'])} className="h-9 rounded-[10px] border border-pos-line bg-pos-surface px-2 text-pos-ink">
                <option value="BELOW_60">Below 60</option><option value="SENIOR">60 to 79</option><option value="SUPER_SENIOR">80 or more</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /> Lives in Delhi, Mumbai, Kolkata or Chennai</label>
          </div>
          {GROUPS.map(([title, fields]) => (
            <fieldset key={title} className="pos-card p-4">
              <legend className="px-1 text-[13px] font-semibold text-pos-ink">{title}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {fields.map(([key, label]) => (
                  <label key={key} className="text-[12px] text-pos-ink/60">{label}
                    <input inputMode="decimal" className={input} value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value.replace(/[^0-9.]/g, '') })} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <div className="grid gap-3 md:grid-cols-2">
            <Column r={result.NEW} best={result.lower === 'NEW'} />
            <Column r={result.OLD} best={result.lower === 'OLD'} />
          </div>
          <p className="text-[13px] text-pos-ink/65">{Number(result.saving) > 0 ? `The ${result.lower === 'NEW' ? 'new' : 'old'} regime saves ${inr(result.saving)}.` : 'Both regimes come to the same tax.'} A taxpayer with business income can leave the new regime only once.</p>
        </div>
      </div>
      <ItrFormPicker values={values} age={age ?? 'BELOW_60'} />
    </div>
  );
}
