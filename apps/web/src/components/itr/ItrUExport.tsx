'use client';

import React, { useState } from 'react';
import { FileJson } from 'lucide-react';
import { Fields, PERSON_FIELDS, num, personBody, selectCls, useItrExport, useSoftwareId, type Details } from './itrShared';
import { Challans, NumberFields, blankChallan, type Challan } from './entityShared';
import { FilledFrom, fillsOf, useDraftDetails, useDraftRegime } from './itrDraftStore';

const EXTRA_FIELDS: Array<[string, string, string?]> = [
  ['employerTan', 'Employer TAN'], ['employerName', 'Employer name'], ['salaryTds', 'TDS on salary'], ['filedOn', 'Date of the updated return', 'date'],
  ['prevAck', 'Last return: acknowledgement'], ['prevDate', 'Last return: date of filing', 'date'],
];
const PREV_FIELDS: Array<[string, string]> = [
  ['prevTotal', 'Last return: total income'], ['prevSalary', 'Last return: salary'], ['prevHp', 'Last return: house property'], ['prevCg', 'Last return: capital gains'],
  ['prevOs', 'Last return: other sources'], ['prevPayable', 'Last return: amount payable'], ['prevRefundClaimed', 'Last return: refund claimed'], ['prevRefundIssued', 'Refund issued, with 244A interest'],
];
const DRAFT_FIELDS = [...PERSON_FIELDS, ...EXTRA_FIELDS];
const REASONS: Array<[string, string]> = [['1', 'Return previously not filed'], ['2', 'Income not reported correctly'], ['3', 'Wrong heads of income chosen'], ['7', 'Wrong rate of tax'], ['OTH', 'Others']];

const inr = (v: number | undefined) => `₹${(v ?? 0).toLocaleString('en-IN')}`;

/**
 * Updated return (ITR-U) under section 139(8A) for Assessment Year 2026-27, over an ITR-2 built from the figures entered:
 * works Part B-ATI and the additional income-tax under section 140B (25%, 50%, 60% or 70% by the period of filing). The
 * Department has not yet released AY 2026-27 schemas for updated returns, so the file is checked and worked but not written.
 */
export function ItrUExport({ values }: { values: Record<string, string> }) {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itru');
  const [d, setD] = useState<Details>({});
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [reason, setReason] = useState('2');
  const [eligible, setEligible] = useState(false);
  const [paid, setPaid] = useState<Challan[]>([blankChallan()]);
  const v = (k: string) => values[k] || undefined;
  const n = (k: string) => (d[k] ? Number(d[k]) : undefined);
  const filled = fillsOf(useDraftDetails(d, setD, DRAFT_FIELDS), useDraftRegime(regime, setRegime));

  const make = () => {
    const gross = num(v('salary.gross'));
    const filed = reason !== '1' && d.prevAck;
    exp.run({
      base: {
        form: 'ITR2',
        input: {
          ...personBody(d),
          filing: { section: 11, regime },
          salary: gross ? { professionalTax: num(v('salary.professionalTax')), employers: [{ tan: d.employerTan ? d.employerTan.toUpperCase() : undefined, name: d.employerName || 'Employer', nature: 'OTH', address: { line: d.city || 'Address', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '' }, gross, tds: Number(d.salaryTds || 0) }] } : undefined,
          houses: v('house.rent') ? [{ letOut: true, address: 'Let-out property', city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '', rent: num(v('house.rent')), municipalTax: num(v('house.municipalTax')) }] : [],
          otherSources: { savingsInterest: num(v('otherSources.savingsInterest')), depositInterest: num(v('otherSources.depositInterest')), dividends: num(v('otherSources.dividends')), other: num(v('otherSources.other')) },
        },
      },
      filedOn: d.filedOn || undefined,
      eligible,
      reasons: [reason],
      previous: filed ? {
        section: '139(1)', form: 'ITR2', ack: d.prevAck, filedOn: d.prevDate ?? '', totalIncome: n('prevTotal') ?? 0,
        heads: { salary: n('prevSalary'), houseProperty: n('prevHp'), capitalGains: n('prevCg'), otherSources: n('prevOs') },
        amountPayable: n('prevPayable') ?? 0, refundClaimed: n('prevRefundClaimed'), refundIssued: n('prevRefundIssued'),
      } : undefined,
      payments140B: paid.filter((c) => c.amount).map((c) => ({ bsr: c.bsr, date: c.date, serial: Number(c.serial || 0), amount: Number(c.amount) })),
    });
  };

  const s = exp.summary;
  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> Updated return (ITR-U), Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/70">Under section 139(8A), after 31 Dec 2026 and up to 31 Mar 2031. Additional income-tax under section 140B is 25% of the tax and interest on the updated income up to 31 Mar 2028, 50% up to 31 Mar 2029, 60% up to 31 Mar 2030 and 70% up to 31 Mar 2031; it must be paid before filing. The Department has not yet released the AY 2026-27 schema for updated returns, so the working is shown and the file is not written yet. Returns in response to a notice under section 148 and returns that reduce a loss are not covered.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70">
        <label className="flex items-center gap-2">Regime
          <select value={regime} onChange={(e) => setRegime(e.target.value as 'NEW' | 'OLD')} className={selectCls}><option value="NEW">New</option><option value="OLD">Old (opting out)</option></select>
        </label>
        <label className="flex items-center gap-2">Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectCls}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={eligible} onChange={(e) => setEligible(e.target.checked)} /> Eligible under the provisos to section 139(8A)</label>
      </div>
      <FilledFrom fills={filled} />
      <Fields fields={PERSON_FIELDS} d={d} setD={setD} />
      <Fields fields={EXTRA_FIELDS} d={d} setD={setD} />
      {reason !== '1' && <NumberFields fields={PREV_FIELDS} d={d} setD={setD} />}
      <Challans rows={paid} setRows={setPaid} kinds={false} title="Tax paid under section 140B" />
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">Work the updated return</button>
      {configured === false && <p className="rounded-[10px] bg-[#b45309]/10 px-3 py-2 text-[13px] text-[#b45309]">The software ID is not set on the server; the return is checked but not written.</p>}
      {exp.error && <p className="text-[13px] text-[#dc2626]">{exp.error}</p>}
      {exp.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#dc2626]">{exp.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      {s && 'aggregateLiability' in s && (
        <dl className="grid gap-x-6 gap-y-1 text-[13px] text-pos-ink/70 sm:grid-cols-2">
          <dt>Additional income</dt><dd className="font-mono text-pos-ink">{inr(s.additionalIncome)}</dd>
          <dt>Updated total income</dt><dd className="font-mono text-pos-ink">{inr(s.updatedTotalIncome)}</dd>
          <dt>Aggregate liability (item 9)</dt><dd className="font-mono text-pos-ink">{inr(s.aggregateLiability)}</dd>
          <dt>Additional income-tax at {s.additionalTaxRate}% (item 10)</dt><dd className="font-mono text-pos-ink">{inr(s.additionalTax)}</dd>
          <dt>Net amount payable (item 11)</dt><dd className="font-mono text-pos-ink">{inr(s.netPayable)}</dd>
          <dt>Paid under section 140B</dt><dd className="font-mono text-pos-ink">{inr(s.paid140B)}</dd>
          <dt>Still to pay</dt><dd className="font-mono font-semibold text-pos-ink">{inr(s.taxDue)}</dd>
        </dl>
      )}
    </section>
  );
}
