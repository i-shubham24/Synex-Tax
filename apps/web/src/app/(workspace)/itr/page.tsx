'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, TrendingUp, Users } from 'lucide-react';
import { itrComputation, itrInputFromValues, type ItrInput, type ItrRegimeResult } from '@synextax/tax-engine';
import { ItrFormPicker, formFor, type Form, type Taxpayer } from '../../../components/itr/ItrFormPicker';
import { AdvanceTaxForecasterPanel } from '../../../components/itr/AdvanceTaxForecasterPanel';
import { ItrImportPanel } from '../../../components/itr/import/ItrImportPanel';
import { ItrStatementsImportPanel } from '../../../components/itrStatements/ItrStatementsImportPanel';
import { FilledFrom, ItrDraftProvider, useDraftPageValues, useItrDraft } from '../../../components/itr/itrDraftStore';
import { ItrReturnBar } from '../../../components/itr/returns/ItrReturnBar';

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

const PAGE_FIELDS = GROUPS.flatMap(([, fields]) => fields);
const toInput = (v: Record<string, string>, age: ItrInput['ageBand'], metro: boolean): ItrInput => itrInputFromValues(v, age ?? 'BELOW_60', metro);

function Column({ r, best }: { r: ItrRegimeResult; best: boolean }) {
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between py-1 text-[13px] ${strong ? 'font-semibold text-pos-ink' : 'text-pos-ink/75'}`}><span>{label}</span><span className="tabular-nums">{inr(v)}</span></div>
  );
  const payable = Number(r.payable);
  return (
    <div className={`pos-card p-4 ${best ? 'ring-2 ring-pos-accent' : ''}`}>
      <h3 className="mb-2 text-[15px] font-semibold text-pos-ink">{r.regime === 'NEW' ? 'New regime' : 'Old regime'}{best ? <span className="ml-2 rounded-full bg-pos-accent px-2 py-0.5 text-[12px] text-white">Lower tax</span> : null}</h3>
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

/** Income tax computation and advance tax forecaster, with the imports shared by every return form. */
export default function ItrPage() {
  return <ItrDraftProvider><ItrWorkspace /></ItrDraftProvider>;
}

function ItrWorkspace() {
  const [tab, setTab] = useState<'computation' | 'advance-tax'>('computation');
  const [values, setValues] = useState<Record<string, string>>({});
  const [age, setAge] = useState<ItrInput['ageBand']>('BELOW_60');
  const [metro, setMetro] = useState(false);
  const [taxpayer, setTaxpayer] = useState<Taxpayer>('INDIVIDUAL');
  const [chosen, setChosen] = useState<Form | null>(null);
  const result = useMemo(() => itrComputation(toInput(values, age, metro)), [values, age, metro]);
  const { applyStatements } = useItrDraft();
  const pageFills = useDraftPageValues(values, setValues, PAGE_FIELDS);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Income tax & Advance tax</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/60">Dual-regime computation, official JSON generation, and live Section 234B/234C advance tax forecasting for Tax Year 2026-27.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="tablist">
          <Link
            href="/itr/register"
            className="inline-flex items-center gap-2 rounded-full border border-pos-line px-4 py-2 text-[13.5px] text-pos-ink/70 hover:bg-pos-tint transition-colors"
          >
            <Users className="h-4 w-4" /> Assessee register
          </Link>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'computation'}
            onClick={() => setTab('computation')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] ${tab === 'computation' ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}
          >
            <Calculator className="h-4 w-4" /> Computation & Forms
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'advance-tax'}
            onClick={() => setTab('advance-tax')}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] ${tab === 'advance-tax' ? 'bg-pos-accent text-white' : 'border border-pos-line text-pos-ink/70 hover:bg-pos-tint'}`}
          >
            <TrendingUp className="h-4 w-4" /> Advance Tax & 234B/C
          </button>
        </div>
      </div>

      {tab === 'advance-tax' ? (
        <AdvanceTaxForecasterPanel />
      ) : (
        <>
          <ItrReturnBar
            values={values} setValues={setValues} age={age ?? 'BELOW_60'} setAge={setAge} metro={metro} setMetro={setMetro}
            taxpayer={taxpayer} setTaxpayer={setTaxpayer} form={formFor(taxpayer, values, chosen)} setChosen={setChosen} suggestedRegime={result.lower}
          />
          <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,720px)]">
            <div className="space-y-3">
              <FilledFrom fills={pageFills} />
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
                      <label key={key} className="text-[12px] font-medium text-pos-ink/75">{label}
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
          <div className="grid gap-5 2xl:grid-cols-2">
            <ItrImportPanel values={values} onApply={(patch) => setValues((v) => ({ ...v, ...patch }))} />
            <ItrStatementsImportPanel onApply={applyStatements} />
          </div>
          <ItrFormPicker values={values} age={age ?? 'BELOW_60'} taxpayer={taxpayer} setTaxpayer={setTaxpayer} chosen={chosen} setChosen={setChosen} />
        </>
      )}
    </div>
  );
}
