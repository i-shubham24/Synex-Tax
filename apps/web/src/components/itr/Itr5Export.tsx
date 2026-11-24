'use client';

import React, { useState } from 'react';
import { FileJson, Plus, Trash2 } from 'lucide-react';
import { ExportResult, Fields, inputCls, selectCls, useItrExport, useSoftwareId, type Details } from './itrShared';
import { AUDIT_FIELDS, BOOKS_FIELDS, Cash5, Challans, ENTITY_FIELDS, NumberFields, SectionSelect, blankChallan, entityBody, useEntityDraft, type Challan } from './entityShared';
import { FilledFrom } from './itrDraftStore';

type Partner = { name: string; pan: string; share: string; working: boolean; interest: string; rate: string; remuneration: string };
const blankPartner = (): Partner => ({ name: '', pan: '', share: '', working: true, interest: '', rate: '', remuneration: '' });

const BS_FIELDS: Array<[string, string]> = [
  ['partnersCapital', "Partners' capital"], ['reserves', 'Reserves'], ['securedLoansBank', 'Secured loans from banks'], ['unsecuredLoansOthers', 'Unsecured loans'],
  ['grossBlock', 'Fixed assets, gross block'], ['accumulatedDepreciation', 'Accumulated depreciation'], ['investmentsLongTerm', 'Investments'], ['stock', 'Stock'],
  ['debtors', 'Sundry debtors'], ['bank', 'Bank balances'], ['cashInHand', 'Cash in hand'], ['loansAdvances', 'Loans and advances'],
  ['creditors', 'Sundry creditors'], ['otherPayables', 'Other payables'], ['incomeTaxProvision', 'Provision for income tax'], ['otherProvisions', 'Other provisions'],
];

/**
 * ITR-5 JSON for Assessment Year 2026-27 for a partnership firm or LLP keeping regular books: summary trading and
 * profit and loss account, balance sheet, depreciation by block, partners' interest and remuneration within section
 * 40(b), tax at 30% with surcharge and cess. AOPs, BOIs, presumptive income and losses are refused with reasons.
 */
export function Itr5Export() {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itr5');
  const [d, setD] = useState<Details>({});
  const [kind, setKind] = useState<'FIRM' | 'LLP'>('FIRM');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const [partners, setPartners] = useState<Partner[]>([blankPartner(), blankPartner()]);
  const [challans, setChallans] = useState<Challan[]>([blankChallan()]);
  const filled = useEntityDraft(d, setD, challans, setChallans);
  const setP = (k: number, patch: Partial<Partner>) => setPartners(partners.map((p, n) => (n === k ? { ...p, ...patch } : p)));

  const make = () => {
    const addr = { line: [d.residenceNo, d.locality].filter(Boolean).join(', ') || 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' };
    const bs = Object.fromEntries(BS_FIELDS.map(([k]) => [k, d[`bs.${k}`] ? Number(d[`bs.${k}`]) : undefined]));
    exp.run({
      ...entityBody(d, section, challans, kind === 'LLP' ? 'DP' : 'MP'),
      kind, llpin: kind === 'LLP' && d.llpin ? d.llpin.toUpperCase() : undefined,
      partners: partners.filter((p) => p.name).map((p) => ({
        name: p.name, pan: p.pan.toUpperCase(), address: addr, share: Number(p.share || 0), working: p.working,
        interest: p.interest ? Number(p.interest) : undefined, rate: p.rate ? Number(p.rate) : undefined, remuneration: p.remuneration ? Number(p.remuneration) : undefined,
      })),
      balanceSheet: { ...bs, partnersCapital: Number(d['bs.partnersCapital'] || 0) },
    });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-5 return file for a firm or LLP, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/70">Written to the Department&apos;s ITR-5 schema, version 1.1. Tax is 30% of total income, with surcharge of 12% above ₹1 crore (with marginal relief) and cess of 4%. Interest to partners above 12% and remuneration above the section 40(b) limit are added back. The due date is 31 Aug 2026, or 31 Oct 2026 where the accounts are audited. Losses, presumptive income and Chapter VI-A deductions are not written here.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
        <label className="flex items-center gap-2">Entity
          <select value={kind} onChange={(e) => setKind(e.target.value as 'FIRM' | 'LLP')} className={selectCls}><option value="FIRM">Partnership firm</option><option value="LLP">LLP</option></select>
        </label>
        <SectionSelect section={section} setSection={setSection} />
        <Cash5 d={d} setD={setD} />
      </div>
      <FilledFrom fills={filled} />
      <Fields fields={kind === 'LLP' ? [...ENTITY_FIELDS, ['llpin', 'LLPIN']] : ENTITY_FIELDS} d={d} setD={setD} />
      <h3 className="text-[13px] font-semibold text-pos-ink">Profit and loss account, in summary</h3>
      <NumberFields fields={BOOKS_FIELDS} d={d} setD={setD} />
      <h3 className="text-[13px] font-semibold text-pos-ink">Balance sheet on 31 Mar 2026</h3>
      <NumberFields fields={BS_FIELDS.map(([k, l]) => [`bs.${k}`, l])} d={d} setD={setD} />
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-pos-ink">Partners</h3>
        {partners.map((p, k) => (
          <div key={k} className="grid items-end gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <label className="text-[12px] text-pos-ink/60 xl:col-span-2">Name<input value={p.name} onChange={(e) => setP(k, { name: e.target.value })} className={inputCls} /></label>
            <label className="text-[12px] text-pos-ink/60">PAN<input value={p.pan} onChange={(e) => setP(k, { pan: e.target.value })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Share %<input inputMode="decimal" value={p.share} onChange={(e) => setP(k, { share: e.target.value.replace(/[^0-9.]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Interest paid<input inputMode="decimal" value={p.interest} onChange={(e) => setP(k, { interest: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Rate %<input inputMode="decimal" value={p.rate} onChange={(e) => setP(k, { rate: e.target.value.replace(/[^0-9.]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <label className="text-[12px] text-pos-ink/60">Remuneration<input inputMode="decimal" value={p.remuneration} onChange={(e) => setP(k, { remuneration: e.target.value.replace(/[^0-9]/g, '') })} className={`${inputCls} font-mono`} /></label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[12px] text-pos-ink/60"><input type="checkbox" checked={p.working} onChange={(e) => setP(k, { working: e.target.checked })} /> Working</label>
              <button type="button" aria-label="Remove partner" onClick={() => setPartners(partners.filter((_, n) => n !== k))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-pos-line text-pos-ink/60 hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setPartners([...partners, blankPartner()])} className="flex items-center gap-1 text-[13px] text-pos-accent"><Plus className="h-4 w-4" /> Add a partner</button>
      </div>
      <h3 className="text-[13px] font-semibold text-pos-ink">Tax audit</h3>
      <Fields fields={AUDIT_FIELDS} d={d} setD={setD} />
      <Challans rows={challans} setRows={setChallans} />
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-5 JSON' : 'Check ITR-5'}</button>
      <ExportResult state={exp} configured={configured} />
    </section>
  );
}
