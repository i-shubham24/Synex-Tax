'use client';

import React, { useState } from 'react';
import { FileJson, Plus, Trash2 } from 'lucide-react';
import { ExportResult, Fields, PERSON_FIELDS, RegimeAndSection, inputCls, num, personBody, selectCls, useItrExport, useSoftwareId, type Details } from './itrShared';

type Sale = { kind: '111A' | '112A' | 'STCG' | 'LTCG'; date: string; saleValue: string; cost: string; expenses: string; isin: string; name: string; before2018: boolean; fmv: string };
const blank = (): Sale => ({ kind: '112A', date: '', saleValue: '', cost: '', expenses: '', isin: '', name: '', before2018: false, fmv: '' });
const KINDS: Array<[Sale['kind'], string]> = [['111A', 'Listed equity, short term (111A)'], ['112A', 'Listed equity, long term (112A)'], ['STCG', 'Other asset, short term'], ['LTCG', 'Other asset, long term (112)']];

const EXTRA_FIELDS: Array<[string, string, string?]> = [
  ['employerTan', 'Employer TAN'], ['employerName', 'Employer name'], ['employerAddress', 'Employer address'], ['salaryTds', 'TDS on salary'],
];

/**
 * ITR-2 JSON for Assessment Year 2026-27: salary, house property, other sources and capital gains sale by
 * sale, with set-off of current-year losses. Land or building sales, brought-forward losses and income
 * above ₹50 lakh are not written here.
 */
export function Itr2Export({ values }: { values: Record<string, string> }) {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itr2');
  const [d, setD] = useState<Details>({ stateCode: '' });
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const [sales, setSales] = useState<Sale[]>([blank()]);
  const v = (k: string) => values[k] || undefined;
  const setSale = (k: number, patch: Partial<Sale>) => setSales(sales.map((s, n) => (n === k ? { ...s, ...patch } : s)));

  const make = () => {
    const gross = num(v('salary.gross'));
    const houses = [
      ...(v('house.rent') ? [{ letOut: true, address: 'Let-out property', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '', rent: num(v('house.rent')), municipalTax: num(v('house.municipalTax')) }] : []),
    ];
    exp.run({
      ...personBody(d),
      filing: { section, regime },
      salary: gross ? { professionalTax: num(v('salary.professionalTax')), employers: [{ tan: d.employerTan ? d.employerTan.toUpperCase() : undefined, name: d.employerName || 'Employer', nature: 'OTH', address: { line: d.employerAddress || d.city || 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' }, gross, tds: Number(d.salaryTds || 0) }] } : undefined,
      houses,
      capitalGains: sales.filter((s) => s.saleValue).map((s) => ({
        kind: s.kind, date: s.date, saleValue: Number(s.saleValue), cost: Number(s.cost || 0), expenses: num(s.expenses),
        ...(s.kind === '112A' ? { isin: s.isin.toUpperCase(), name: s.name || undefined, acquiredBefore1Feb2018: s.before2018, fmv31Jan2018: s.before2018 ? num(s.fmv) : undefined } : {}),
      })),
      otherSources: { savingsInterest: num(v('otherSources.savingsInterest')), depositInterest: num(v('otherSources.depositInterest')), dividends: num(v('otherSources.dividends')), other: num(v('otherSources.other')) },
      deductions: regime === 'OLD' && v('deductions.section80C') ? { section80C: [{ amount: Number(v('deductions.section80C')), id: 'As per proofs' }], section80CCD1B: num(v('deductions.npsSelf')) } : undefined,
    });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-2 return file, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/65">For salary, house property, capital gains and other income of 2025-26, total income up to ₹50 lakh. Written to the Department&apos;s ITR-2 schema, version 1.2. Gains under 111A are taxed at 20%, under 112A at 12.5% above ₹1.25 lakh, other long-term gains at 12.5%. The due date is 31 Jul 2026.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70"><RegimeAndSection regime={regime} setRegime={setRegime} section={section} setSection={setSection} /></div>
      <Fields fields={PERSON_FIELDS} d={d} setD={setD} />
      <Fields fields={EXTRA_FIELDS} d={d} setD={setD} />
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Capital gains, sale by sale</h3>
        {sales.map((s, k) => (
          <div key={k} className="grid items-end gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <label className="text-[12px] text-pos-ink/60 xl:col-span-2">Kind
              <select value={s.kind} onChange={(e) => setSale(k, { kind: e.target.value as Sale['kind'] })} className={`${selectCls} w-full`}>{KINDS.map(([key, l]) => <option key={key} value={key}>{l}</option>)}</select>
            </label>
            <label className="text-[12px] text-pos-ink/60">Date of sale<input type="date" value={s.date} onChange={(e) => setSale(k, { date: e.target.value })} className={inputCls} /></label>
            <label className="text-[12px] text-pos-ink/60">Sale value<input inputMode="decimal" value={s.saleValue} onChange={(e) => setSale(k, { saleValue: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Cost<input inputMode="decimal" value={s.cost} onChange={(e) => setSale(k, { cost: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            {s.kind === '112A' ? (
              <>
                <label className="text-[12px] text-pos-ink/60">ISIN<input value={s.isin} onChange={(e) => setSale(k, { isin: e.target.value })} className={`${inputCls} font-mono`} /></label>
                <label className="text-[12px] text-pos-ink/60">Value on 31 Jan 2018<input inputMode="decimal" value={s.fmv} placeholder="if bought earlier" onChange={(e) => setSale(k, { fmv: e.target.value.replace(/[^0-9]/g, ''), before2018: !!e.target.value })} className={`${inputCls} font-mono`} /></label>
              </>
            ) : (
              <label className="text-[12px] text-pos-ink/60 xl:col-span-2">Transfer expenses<input inputMode="decimal" value={s.expenses} onChange={(e) => setSale(k, { expenses: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            )}
            <button type="button" aria-label="Remove sale" onClick={() => setSales(sales.filter((_, n) => n !== k))} className="flex h-9 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/60 hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setSales([...sales, blank()])} className="flex items-center gap-1 text-[13px] text-pos-accent"><Plus className="h-4 w-4" /> Add a sale</button>
      </div>
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-2 JSON' : 'Check ITR-2'}</button>
      <ExportResult state={exp} configured={configured} />
    </section>
  );
}
