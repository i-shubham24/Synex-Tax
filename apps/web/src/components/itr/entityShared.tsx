'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { inputCls, selectCls, type Details } from './itrShared';
import { fillsOf, useDraftChallans, useDraftDetails } from './itrDraftStore';

/** Fields shared by the ITR-5 and ITR-6 forms: the entity, the books in summary, audit and bank. Nothing is stored. */
export const ENTITY_FIELDS: Array<[string, string, string?]> = [
  ['name', 'Name of the entity'], ['pan', 'PAN'], ['formedOn', 'Date of formation or incorporation', 'date'], ['natureCode', 'Business code (5 digits)'],
  ['tradeName', 'Trade name'], ['mobile', 'Mobile'], ['email', 'Email', 'email'], ['residenceNo', 'Office or building'],
  ['locality', 'Area or locality'], ['city', 'City or district'], ['stateCode', 'State code (e.g. 19 Maharashtra)'], ['pin', 'PIN code'],
  ['signName', 'Person verifying'], ['signFather', "Their father's name"], ['signPan', 'Their PAN'], ['place', 'Place of signing'],
  ['bankIfsc', 'Bank IFSC'], ['bankName', 'Bank name'], ['bankAccount', 'Account number'],
  ['origAck', 'Original acknowledgement (revised return)'], ['origDate', 'Original filing date (revised return)', 'date'],
];

export const BOOKS_FIELDS: Array<[string, string]> = [
  ['salesGoods', 'Sales of goods'], ['salesServices', 'Sales of services'], ['professionReceipts', 'Professional receipts'], ['openingStock', 'Opening stock'],
  ['purchases', 'Purchases'], ['directExpenses', 'Direct expenses'], ['closingStock', 'Closing stock'], ['otherRent', 'Rent received (credited)'],
  ['otherInterest', 'Interest received (credited)'], ['otherDividends', 'Dividends received (credited)'], ['otherInvestments', 'Profit on sale of investments'], ['otherMisc', 'Other income'],
  ['salaries', 'Salaries and wages'], ['rent', 'Rent paid'], ['professionalFees', 'Professional fees'], ['otherExpenses', 'Other expenses'],
  ['interestOthers', 'Interest paid (not to partners)'], ['bookDepreciation', 'Depreciation in the books'], ['currentTax', 'Provision for current tax'], ['deferredTax', 'Provision for deferred tax'],
  ['depPM15', 'Plant and machinery 15%: WDV on 1 Apr 2025'], ['depPM15Add', 'Plant and machinery 15%: additions'], ['depPM40', 'Computers 40%: WDV on 1 Apr 2025'], ['depPM40Add', 'Computers 40%: additions'],
  ['depFURN10', 'Furniture 10%: WDV on 1 Apr 2025'], ['depFURN10Add', 'Furniture 10%: additions'],
  ['depositInterest', 'Interest offered under other sources'], ['dividends', 'Dividends offered under other sources'],
];

export const AUDIT_FIELDS: Array<[string, string, string?]> = [
  ['auditFirm', 'Audit firm (if audited u/s 44AB)'], ['auditPan', 'Audit firm PAN'], ['auditDate', 'Date of audit report', 'date'], ['auditAck', 'Form 3CD acknowledgement'],
];

const amt = (d: Details, k: string) => (d[k] ? Number(d[k]) : undefined);

export function NumberFields({ fields, d, setD }: { fields: Array<[string, string]>; d: Details; setD: (d: Details) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {fields.map(([k, label]) => (
        <label key={k} className="text-[12px] text-pos-ink/60">{label}
          <input inputMode="decimal" value={d[k] ?? ''} onChange={(e) => setD({ ...d, [k]: e.target.value.replace(/[^0-9-]/g, '') })} className={`${inputCls} font-mono`} autoComplete="off" />
        </label>
      ))}
    </div>
  );
}

export type Challan = { bsr: string; date: string; serial: string; amount: string; kind: 'ADVANCE' | 'SELF' };
export const blankChallan = (): Challan => ({ bsr: '', date: '', serial: '', amount: '', kind: 'ADVANCE' });

export function Challans({ rows, setRows, kinds = true, title = 'Tax paid (advance and self-assessment)' }: { rows: Challan[]; setRows: (r: Challan[]) => void; kinds?: boolean; title?: string }) {
  const set = (k: number, patch: Partial<Challan>) => setRows(rows.map((r, n) => (n === k ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <h3 className="text-[13px] font-semibold text-pos-ink">{title}</h3>
      {rows.map((r, k) => (
        <div key={k} className="grid items-end gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <label className="text-[12px] text-pos-ink/60">BSR code<input value={r.bsr} onChange={(e) => set(k, { bsr: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
          <label className="text-[12px] text-pos-ink/60">Date<input type="date" value={r.date} onChange={(e) => set(k, { date: e.target.value })} className={inputCls} /></label>
          <label className="text-[12px] text-pos-ink/60">Challan serial<input value={r.serial} onChange={(e) => set(k, { serial: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
          <label className="text-[12px] text-pos-ink/60">Amount<input inputMode="decimal" value={r.amount} onChange={(e) => set(k, { amount: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
          {kinds ? (
            <label className="text-[12px] text-pos-ink/60">Kind
              <select value={r.kind} onChange={(e) => set(k, { kind: e.target.value as Challan['kind'] })} className={`${selectCls} w-full`}><option value="ADVANCE">Advance tax</option><option value="SELF">Self-assessment tax</option></select>
            </label>
          ) : <span />}
          <button type="button" aria-label="Remove challan" onClick={() => setRows(rows.filter((_, n) => n !== k))} className="flex h-9 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/60 hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, blankChallan()])} className="flex items-center gap-1 text-[13px] text-pos-accent"><Plus className="h-4 w-4" /> Add a challan</button>
    </div>
  );
}

/**
 * Fills an ITR-5 or ITR-6 form from the imports on the ITR page: contact, address and bank details from
 * last year's return, and the advance and self-assessment tax challans from Form 26AS. Typed fields stay.
 */
export function useEntityDraft(d: Details, setD: (d: Details) => void, rows: Challan[], setRows: (r: Challan[]) => void) {
  return fillsOf(
    useDraftDetails(d, setD, ENTITY_FIELDS),
    useDraftChallans(rows, setRows, (p): Challan => ({ bsr: p.bsr, date: p.date, serial: String(p.serial), amount: String(Math.round(p.amount)), kind: p.kind }), (r) => !r.amount),
  );
}

export const challanBody = (rows: Challan[]) => rows.filter((r) => r.amount).map((r) => ({ bsr: r.bsr, date: r.date, serial: Number(r.serial || 0), amount: Number(r.amount), kind: r.kind }));

/** The part of the ITR-5 and ITR-6 body common to both. */
export function entityBody(d: Details, section: 11 | 12 | 17, rows: Challan[], capacity: string) {
  const dep = ([['PM15', 'depPM15'], ['PM40', 'depPM40'], ['FURN10', 'depFURN10']] as const)
    .filter(([, k]) => d[k] || d[`${k}Add`])
    .map(([block, k]) => ({ block, wdvOpening: Number(d[k] || 0), additionsFull: amt(d, `${k}Add`) }));
  return {
    entity: {
      name: d.name ?? '', pan: (d.pan ?? '').toUpperCase(), formedOn: d.formedOn ?? '',
      address: { residenceNo: d.residenceNo ?? '', locality: d.locality ?? '', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' },
      mobile: d.mobile ?? '', email: d.email ?? '',
    },
    signatory: { name: d.signName ?? '', fatherName: d.signFather ?? '', pan: (d.signPan ?? '').toUpperCase(), capacity, place: d.place ?? '' },
    filing: { section, ...(section === 17 ? { originalAck: d.origAck, originalFiledOn: d.origDate } : {}) },
    natures: [{ code: d.natureCode ?? '', tradeName: d.tradeName || undefined }],
    books: {
      trading: { salesGoods: amt(d, 'salesGoods'), salesServices: amt(d, 'salesServices'), professionReceipts: amt(d, 'professionReceipts'), openingStock: amt(d, 'openingStock'), purchases: amt(d, 'purchases'), directExpenses: amt(d, 'directExpenses'), closingStock: amt(d, 'closingStock') },
      otherIncome: { rent: amt(d, 'otherRent'), interest: amt(d, 'otherInterest'), dividends: amt(d, 'otherDividends'), profitOnInvestments: amt(d, 'otherInvestments'), misc: amt(d, 'otherMisc') },
      expenses: { salaries: amt(d, 'salaries'), rent: amt(d, 'rent'), professionalFees: amt(d, 'professionalFees'), ...(d.otherExpenses ? { other: [{ nature: 'Other expenses', amount: Number(d.otherExpenses) }] } : {}) },
      interestOthers: amt(d, 'interestOthers'), bookDepreciation: amt(d, 'bookDepreciation'), currentTax: amt(d, 'currentTax'), deferredTax: amt(d, 'deferredTax'),
      depreciation: dep,
      cashReceiptsWithin5Pct: d.cash5 === 'Y', cashPaymentsWithin5Pct: d.cash5 === 'Y',
    },
    ...(d.auditFirm ? { audit: { firmName: d.auditFirm, firmPan: (d.auditPan ?? '').toUpperCase(), reportDate: d.auditDate ?? '', ack3CD: d.auditAck ?? '' } } : {}),
    otherSources: { depositInterest: amt(d, 'depositInterest'), dividends: amt(d, 'dividends') },
    taxPayments: challanBody(rows),
    bank: { ifsc: (d.bankIfsc ?? '').toUpperCase(), name: d.bankName ?? '', account: d.bankAccount ?? '', type: 'CA' },
  };
}

export function SectionSelect({ section, setSection }: { section: 11 | 12 | 17; setSection: (s: 11 | 12 | 17) => void }) {
  return (
    <label className="flex items-center gap-2">Return
      <select value={section} onChange={(e) => setSection(Number(e.target.value) as 11 | 12 | 17)} className={selectCls}><option value={11}>On time, 139(1)</option><option value={12}>Belated, 139(4)</option><option value={17}>Revised, 139(5)</option></select>
    </label>
  );
}

export function Cash5({ d, setD }: { d: Details; setD: (d: Details) => void }) {
  return (
    <label className="flex items-center gap-2">Cash receipts and payments each within 5%
      <select value={d.cash5 ?? 'N'} onChange={(e) => setD({ ...d, cash5: e.target.value })} className={selectCls}><option value="N">No</option><option value="Y">Yes</option></select>
    </label>
  );
}
