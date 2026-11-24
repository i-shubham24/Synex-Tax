'use client';

import React, { useState } from 'react';
import { FileJson } from 'lucide-react';
import { ExportResult, Fields, selectCls, useItrExport, useSoftwareId, type Details } from './itrShared';
import { AUDIT_FIELDS, BOOKS_FIELDS, Cash5, Challans, ENTITY_FIELDS, NumberFields, SectionSelect, blankChallan, entityBody, useEntityDraft, type Challan } from './entityShared';
import { FilledFrom } from './itrDraftStore';

const BS_FIELDS: Array<[string, string]> = [
  ['shareCapital', 'Share capital'], ['reserves', 'Reserves and surplus'], ['longTermBorrowingsBank', 'Long-term borrowings from banks'], ['longTermBorrowingsOthers', 'Other long-term borrowings'],
  ['shortTermBorrowingsBank', 'Short-term borrowings from banks'], ['tradePayables', 'Trade payables'], ['otherCurrentLiabilities', 'Other current liabilities'], ['incomeTaxProvision', 'Provision for income tax'],
  ['deferredTaxLiability', 'Deferred tax liability'], ['tangibleGross', 'Tangible assets, gross block'], ['tangibleDepreciation', 'Accumulated depreciation'], ['capitalWip', 'Capital work in progress'],
  ['nonCurrentInvestments', 'Non-current investments'], ['inventories', 'Inventories'], ['tradeReceivables', 'Trade receivables'], ['bankBalances', 'Bank balances'],
  ['cashInHand', 'Cash in hand'], ['shortTermLoansAdvances', 'Short-term loans and advances'], ['otherCurrentAssets', 'Other current assets'], ['deferredTaxAsset', 'Deferred tax asset'],
];

const KEY_FIELDS: Array<[string, string, string?]> = [['kpName', 'Director name'], ['kpPan', 'Director PAN'], ['kpDin', 'DIN'], ['f10icAy', 'Form 10-IC: year of option (e.g. 2021-22)'], ['f10icAck', 'Form 10-IC acknowledgement'], ['f10icDate', 'Form 10-IC date', 'date']];

/**
 * ITR-6 JSON for Assessment Year 2026-27 for a domestic company (not claiming section 11) with accounts not under Ind AS:
 * section 115BAA at 22% with 10% surcharge, or the normal rate of 25% or 30% with the MAT check. MAT liability, MAT credit,
 * losses and Ind AS accounts are refused with reasons.
 */
export function Itr6Export() {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itr6');
  const [d, setD] = useState<Details>({});
  const [option, setOption] = useState<'115BAA' | 'NORMAL25' | 'NORMAL30'>('115BAA');
  const [companyType, setCompanyType] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const [challans, setChallans] = useState<Challan[]>([blankChallan()]);
  const filled = useEntityDraft(d, setD, challans, setChallans);

  const make = () => {
    const bs = Object.fromEntries(BS_FIELDS.map(([k]) => [k, d[`bs.${k}`] ? Number(d[`bs.${k}`]) : undefined]));
    const addr = { line: [d.residenceNo, d.locality].filter(Boolean).join(', ') || 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' };
    exp.run({
      ...entityBody(d, section, challans, 'DR'),
      companyType, unlisted: d.listed !== 'Y',
      regime: option === '115BAA'
        ? { option: '115BAA', form10IC: { assessmentYear: d.f10icAy ?? '', ack: d.f10icAck ?? '', date: d.f10icDate ?? '' } }
        : { option: 'NORMAL', turnover2023_24UpTo400Cr: option === 'NORMAL25', mat: { otherAdditions: d.matAdd ? Number(d.matAdd) : undefined, otherDeductions: d.matDed ? Number(d.matDed) : undefined } },
      keyPersons: [{ name: d.kpName || d.signName || '', designation: 'DIR', pan: (d.kpPan || d.signPan || '').toUpperCase() || undefined, din: d.kpDin || undefined, address: addr }],
      balanceSheet: { ...bs, shareCapital: Number(d['bs.shareCapital'] || 0) },
    });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-6 return file for a company, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/70">Written to the Department&apos;s ITR-6 schema, version 1.0. Under section 115BAA tax is 22% with surcharge of 10% and cess of 4%. Otherwise 25% (turnover of 2023-24 up to ₹400 crore) or 30%, with surcharge of 7% above ₹1 crore and 12% above ₹10 crore; where tax on book profit under section 115JB would be higher, the case is refused for now. The due date is 31 Oct 2026.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
        <label className="flex items-center gap-2">Tax option
          <select value={option} onChange={(e) => setOption(e.target.value as typeof option)} className={selectCls}><option value="115BAA">Section 115BAA</option><option value="NORMAL25">Normal, 25%</option><option value="NORMAL30">Normal, 30%</option></select>
        </label>
        <label className="flex items-center gap-2">Company
          <select value={companyType} onChange={(e) => setCompanyType(e.target.value as 'PRIVATE' | 'PUBLIC')} className={selectCls}><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select>
        </label>
        <label className="flex items-center gap-2">Listed
          <select value={d.listed ?? 'N'} onChange={(e) => setD({ ...d, listed: e.target.value })} className={selectCls}><option value="N">No</option><option value="Y">Yes</option></select>
        </label>
        <SectionSelect section={section} setSection={setSection} />
        <Cash5 d={d} setD={setD} />
      </div>
      <FilledFrom fills={filled} />
      <Fields fields={ENTITY_FIELDS} d={d} setD={setD} />
      <Fields fields={option === '115BAA' ? KEY_FIELDS : KEY_FIELDS.slice(0, 3)} d={d} setD={setD} />
      <h3 className="text-[13px] font-semibold text-pos-ink">Profit and loss account, in summary</h3>
      <NumberFields fields={BOOKS_FIELDS} d={d} setD={setD} />
      {option !== '115BAA' && <NumberFields fields={[['matAdd', 'Book profit: other additions (Form 29B)'], ['matDed', 'Book profit: other deductions (Form 29B)']]} d={d} setD={setD} />}
      <h3 className="text-[13px] font-semibold text-pos-ink">Balance sheet on 31 Mar 2026</h3>
      <NumberFields fields={BS_FIELDS.map(([k, l]) => [`bs.${k}`, l])} d={d} setD={setD} />
      <h3 className="text-[13px] font-semibold text-pos-ink">Tax audit</h3>
      <Fields fields={AUDIT_FIELDS} d={d} setD={setD} />
      <Challans rows={challans} setRows={setChallans} />
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-6 JSON' : 'Check ITR-6'}</button>
      <ExportResult state={exp} configured={configured} />
    </section>
  );
}
