'use client';

import React, { useState } from 'react';
import { FileJson, Plus, Trash2 } from 'lucide-react';
import { ExportResult, Fields, PERSON_FIELDS, RegimeAndSection, inputCls, num, personBody, selectCls, useItrExport, useSoftwareId, type Details } from './itrShared';

type Mode = 'PRESUMPTIVE' | 'BOOKS';
type Sale = { kind: '111A' | '112A' | 'STCG' | 'LTCG'; date: string; saleValue: string; cost: string; isin: string; name: string };
const blankSale = (): Sale => ({ kind: '112A', date: '', saleValue: '', cost: '', isin: '', name: '' });
const KINDS: Array<[Sale['kind'], string]> = [['111A', 'Listed equity, short term (111A)'], ['112A', 'Listed equity, long term (112A)'], ['STCG', 'Other asset, short term'], ['LTCG', 'Other asset, long term (112)']];

const COMMON_FIELDS: Array<[string, string, string?]> = [
  ['natureCode', 'Nature of business code (5 digits)'], ['tradeName', 'Trade name'],
  ['employerTan', 'Employer TAN'], ['employerName', 'Employer name'], ['salaryTds', 'TDS on salary'],
  ['form10IEAAck', 'Form 10-IEA acknowledgement (old regime)'], ['form10IEADate', 'Form 10-IEA date', 'date'],
];
const PRESUMPTIVE_FIELDS: Array<[string, string, string?]> = [
  ['adCode', 'Business code under 44AD'], ['adaCode', 'Profession code under 44ADA'], ['adaCash', 'Professional receipts in cash'],
  ['naDebtors', 'Sundry debtors'], ['naCreditors', 'Sundry creditors'], ['naStock', 'Stock in trade'], ['naCash', 'Cash balance'],
];
const PL_FIELDS: Array<[string, string, string?]> = [
  ['salesGoods', 'Sale of goods'], ['salesServices', 'Sale of services'], ['professionReceipts', 'Receipts from profession'], ['otherIncome', 'Other business income'],
  ['openingStock', 'Opening stock'], ['purchases', 'Purchases'], ['directExpenses', 'Direct expenses'], ['closingStock', 'Closing stock'],
  ['salaries', 'Salaries and wages'], ['rent', 'Rent'], ['powerFuel', 'Power and fuel'], ['telephone', 'Telephone'],
  ['travel', 'Travel'], ['advertisement', 'Advertisement'], ['professionalFees', 'Professional fees'], ['otherExpenses', 'Other expenses'],
  ['interest', 'Interest'], ['bookDepreciation', 'Depreciation in the books'],
];
const DEP_FIELDS: Array<[string, string, string?]> = [
  ['pm15Wdv', 'Plant and machinery 15%, WDV on 1 Apr 2025'], ['pm15Add', 'Additions used 180 days or more'], ['pm15Half', 'Additions used under 180 days'], ['pm15Sold', 'Sale value of assets sold'],
  ['pm40Wdv', 'Computers 40%, WDV on 1 Apr 2025'], ['pm40Add', 'Additions used 180 days or more'], ['pm40Half', 'Additions used under 180 days'], ['pm40Sold', 'Sale value of assets sold'],
  ['furnWdv', 'Furniture 10%, WDV on 1 Apr 2025'], ['furnAdd', 'Additions used 180 days or more'], ['furnHalf', 'Additions used under 180 days'], ['furnSold', 'Sale value of assets sold'],
];
const BS_FIELDS: Array<[string, string, string?]> = [
  ['capital', "Proprietor's capital"], ['reserves', 'Reserves and surplus'], ['securedLoansBank', 'Secured loans from banks'], ['unsecuredLoansOthers', 'Unsecured loans'],
  ['grossBlock', 'Fixed assets, gross block'], ['accumulatedDepreciation', 'Accumulated depreciation'], ['investmentsLongTerm', 'Investments'], ['stock', 'Stock'],
  ['debtors', 'Sundry debtors'], ['cashInHand', 'Cash in hand'], ['bank', 'Balance with banks'], ['loansAdvances', 'Loans and advances'],
  ['creditors', 'Sundry creditors'], ['provisions', 'Provisions'],
];

/**
 * ITR-3 JSON for Assessment Year 2026-27, for business or profession income without a tax audit:
 * presumptive income under 44AD and 44ADA from the figures on this page, or regular books entered as a
 * summary profit and loss account and balance sheet, with salary, other sources and capital gains.
 */
export function Itr3Export({ values }: { values: Record<string, string> }) {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itr3');
  const [d, setD] = useState<Details>({ stateCode: '' });
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const [status, setStatus] = useState<'I' | 'H'>('I');
  const [mode, setMode] = useState<Mode>(Number(values['business.actualProfit'] || 0) > 0 ? 'BOOKS' : 'PRESUMPTIVE');
  const [kind, setKind] = useState<'BUSINESS' | 'PROFESSION'>('BUSINESS');
  const [cashWithin5, setCashWithin5] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const v = (k: string) => values[k] || undefined;
  const n = (k: string) => num(d[k]);
  const setSale = (k: number, patch: Partial<Sale>) => setSales(sales.map((s, i) => (i === k ? { ...s, ...patch } : s)));

  const make = () => {
    const gross = num(v('salary.gross'));
    const digital = Number(v('business.digitalTurnover') ?? 0);
    const other = Number(v('business.otherTurnover') ?? 0);
    const receipts = Number(v('business.professionalReceipts') ?? 0);
    const adaCash = Number(d.adaCash || 0);
    const block = (b: string, p: string) => (n(`${p}Wdv`) || n(`${p}Add`) || n(`${p}Half`) ? [{ block: b, wdvOpening: n(`${p}Wdv`) ?? 0, additionsFull: n(`${p}Add`), additionsHalf: n(`${p}Half`), realisation: n(`${p}Sold`) }] : []);
    const books = mode === 'BOOKS' ? {
      kind,
      trading: { salesGoods: n('salesGoods'), salesServices: n('salesServices'), professionReceipts: n('professionReceipts'), openingStock: n('openingStock'), purchases: n('purchases'), directExpenses: n('directExpenses'), closingStock: n('closingStock') },
      otherIncome: n('otherIncome'),
      expenses: {
        salaries: n('salaries'), rent: n('rent'), powerFuel: n('powerFuel'), telephone: n('telephone'), travel: n('travel'), advertisement: n('advertisement'), professionalFees: n('professionalFees'), interest: n('interest'),
        other: n('otherExpenses') ? [{ nature: 'Other expenses', amount: n('otherExpenses')! }] : undefined,
      },
      bookDepreciation: n('bookDepreciation'),
      depreciation: [...block('PM15', 'pm15'), ...block('PM40', 'pm40'), ...block('FURN10', 'furn')],
      balanceSheet: Object.fromEntries(BS_FIELDS.map(([k]) => [k, k === 'capital' ? Number(d.capital || 0) : n(k)])),
      cashReceiptsWithin5Pct: cashWithin5, cashPaymentsWithin5Pct: cashWithin5,
    } : undefined;
    const natures = d.natureCode ? [{ code: d.natureCode, tradeName: d.tradeName || undefined }] : [];
    exp.run({
      ...personBody(d),
      status,
      karta: status === 'H' ? { name: d.kartaName ?? '', pan: (d.kartaPan ?? '').toUpperCase() } : undefined,
      filing: { section, regime, ...(regime === 'OLD' && d.form10IEAAck ? { form10IEA: { assessmentYear: '2026-27', ack: d.form10IEAAck, date: d.form10IEADate || undefined } } : {}) },
      business: {
        natures,
        ad: mode === 'PRESUMPTIVE' && digital + other > 0 ? { code: d.adCode ?? '', name: d.tradeName || 'Business', digital, cash: other } : undefined,
        ada: mode === 'PRESUMPTIVE' && receipts > 0 ? { code: d.adaCode ?? '', name: d.tradeName || 'Profession', digital: Math.max(0, receipts - adaCash), cash: adaCash } : undefined,
        noAccounts: mode === 'PRESUMPTIVE' ? { debtors: Number(d.naDebtors || 0), creditors: Number(d.naCreditors || 0), stock: Number(d.naStock || 0), cash: Number(d.naCash || 0) } : undefined,
        books,
      },
      salary: gross && status === 'I' ? { professionalTax: num(v('salary.professionalTax')), employers: [{ tan: d.employerTan ? d.employerTan.toUpperCase() : undefined, name: d.employerName || 'Employer', nature: 'OTH', address: { line: d.city || 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' }, gross, tds: Number(d.salaryTds || 0) }] } : undefined,
      houses: v('house.rent') ? [{ letOut: true, address: 'Let-out property', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '', rent: num(v('house.rent')), municipalTax: num(v('house.municipalTax')) }] : undefined,
      capitalGains: sales.filter((s) => s.saleValue).map((s) => ({ kind: s.kind, date: s.date, saleValue: Number(s.saleValue), cost: Number(s.cost || 0), ...(s.kind === '112A' ? { isin: s.isin.toUpperCase(), name: s.name || undefined } : {}) })),
      otherSources: { savingsInterest: num(v('otherSources.savingsInterest')), depositInterest: num(v('otherSources.depositInterest')), dividends: num(v('otherSources.dividends')), other: num(v('otherSources.other')) },
      deductions: regime === 'OLD' && v('deductions.section80C') ? { section80C: [{ amount: Number(v('deductions.section80C')), id: 'As per proofs' }] } : undefined,
    });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-3 return file, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/65">For business or profession income of 2025-26 where no tax audit is needed, with total income up to ₹50 lakh. Written to the Department&apos;s ITR-3 schema, version 1.1 of 30 Jun 2026. The due date without audit is 31 Aug 2026. Audit cases, partners&apos; share from firms, business losses and disallowances under sections 36 to 43B are not written here; an audit case starts with the tax audit forms.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
        <RegimeAndSection regime={regime} setRegime={setRegime} section={section} setSection={setSection} />
        <label className="flex items-center gap-2">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as 'I' | 'H')} className={selectCls}><option value="I">Individual</option><option value="H">HUF</option></select>
        </label>
        <label className="flex items-center gap-2">Income from
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={selectCls}><option value="PRESUMPTIVE">Presumptive, 44AD or 44ADA</option><option value="BOOKS">Regular books of account</option></select>
        </label>
      </div>
      <Fields fields={status === 'H' ? [...PERSON_FIELDS.map(([k, l, t]): [string, string, string?] => (k === 'surname' ? [k, 'Name of the HUF', t] : k === 'dob' ? [k, 'Date of formation', t] : [k, l, t])), ['kartaName', 'Karta name'], ['kartaPan', 'Karta PAN']] : PERSON_FIELDS} d={d} setD={setD} />
      <Fields fields={COMMON_FIELDS} d={d} setD={setD} />
      {mode === 'PRESUMPTIVE' ? (
        <>
          <p className="text-[13px] text-pos-ink/65">Turnover and receipts are taken from the figures above: digital turnover at 6%, other turnover at 8%, professional receipts at 50%.</p>
          <Fields fields={PRESUMPTIVE_FIELDS} d={d} setD={setD} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
            <label className="flex items-center gap-2">Books of a
              <select value={kind} onChange={(e) => setKind(e.target.value as 'BUSINESS' | 'PROFESSION')} className={selectCls}><option value="BUSINESS">Business</option><option value="PROFESSION">Profession</option></select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={cashWithin5} onChange={(e) => setCashWithin5(e.target.checked)} /> Cash receipts and cash payments each within 5% of the totals</label>
          </div>
          <h3 className="text-[13px] font-semibold text-pos-ink">Trading and profit and loss account</h3>
          <Fields fields={PL_FIELDS} d={d} setD={setD} />
          <h3 className="text-[13px] font-semibold text-pos-ink">Depreciation under section 32, by block</h3>
          <Fields fields={DEP_FIELDS} d={d} setD={setD} />
          <h3 className="text-[13px] font-semibold text-pos-ink">Balance sheet on 31 Mar 2026</h3>
          <Fields fields={BS_FIELDS} d={d} setD={setD} />
        </>
      )}
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Capital gains, sale by sale</h3>
        {sales.map((s, k) => (
          <div key={k} className="grid items-end gap-2 sm:grid-cols-3 xl:grid-cols-7">
            <label className="text-[12px] text-pos-ink/60 xl:col-span-2">Kind
              <select value={s.kind} onChange={(e) => setSale(k, { kind: e.target.value as Sale['kind'] })} className={`${selectCls} w-full`}>{KINDS.map(([key, l]) => <option key={key} value={key}>{l}</option>)}</select>
            </label>
            <label className="text-[12px] text-pos-ink/60">Date of sale<input type="date" value={s.date} onChange={(e) => setSale(k, { date: e.target.value })} className={inputCls} /></label>
            <label className="text-[12px] text-pos-ink/60">Sale value<input inputMode="decimal" value={s.saleValue} onChange={(e) => setSale(k, { saleValue: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Cost<input inputMode="decimal" value={s.cost} onChange={(e) => setSale(k, { cost: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">ISIN (112A)<input value={s.isin} disabled={s.kind !== '112A'} onChange={(e) => setSale(k, { isin: e.target.value })} className={`${inputCls} font-mono`} /></label>
            <button type="button" aria-label="Remove sale" onClick={() => setSales(sales.filter((_, i) => i !== k))} className="flex h-9 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/60 hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setSales([...sales, blankSale()])} className="flex items-center gap-1 text-[13px] text-pos-accent"><Plus className="h-4 w-4" /> Add a sale</button>
      </div>
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-3 JSON' : 'Check ITR-3'}</button>
      <ExportResult state={exp} configured={configured} />
    </section>
  );
}
