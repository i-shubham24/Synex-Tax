'use client';

import React, { useState } from 'react';
import { FileJson } from 'lucide-react';
import { ExportResult, Fields, PERSON_FIELDS, RegimeAndSection, num, personBody, useItrExport, useSoftwareId, type Details } from './itrShared';
import { FilledFrom, fillsOf, useDraftDetails, useDraftRegime } from './itrDraftStore';

const BUSINESS_FIELDS: Array<[string, string, string?]> = [
  ['adCode', 'Business code under 44AD (5 digits)'], ['adName', 'Name of the business'], ['adOtherMode', 'Turnover in other modes (not cash, not banking)'],
  ['adaCode', 'Profession code under 44ADA'], ['adaName', 'Name of the practice'], ['adaCash', 'Professional receipts in cash'],
  ['capital', "Proprietor's capital"], ['sundryCreditors', 'Sundry creditors'], ['inventories', 'Stock'], ['sundryDebtors', 'Sundry debtors'],
  ['bankBalance', 'Balance with banks'], ['cashInHand', 'Cash in hand'],
  ['employerTan', 'Employer TAN'], ['employerName', 'Employer name'], ['salaryTds', 'TDS on salary'],
  ['form10IEAAck', 'Form 10-IEA acknowledgement (old regime)'], ['form10IEADate', 'Form 10-IEA date', 'date'],
];
const DRAFT_FIELDS = [...PERSON_FIELDS, ...BUSINESS_FIELDS];

/**
 * ITR-4 (Sugam) JSON for Assessment Year 2026-27: presumptive income under 44AD and 44ADA from the
 * figures on this page, with salary, one house property, other sources and 112A gains up to ₹1.25 lakh.
 * Turnover entered as digital is taken at 6%, other turnover at 8%, professional receipts at 50%.
 */
export function Itr4Export({ values }: { values: Record<string, string> }) {
  const configured = useSoftwareId();
  const exp = useItrExport('/api/v1/itr/itr4');
  const [d, setD] = useState<Details>({ stateCode: '' });
  const [regime, setRegime] = useState<'NEW' | 'OLD'>('NEW');
  const [section, setSection] = useState<11 | 12 | 17>(12);
  const v = (k: string) => values[k] || undefined;
  const filled = fillsOf(useDraftDetails(d, setD, DRAFT_FIELDS), useDraftRegime(regime, setRegime));

  const make = () => {
    const gross = num(v('salary.gross'));
    const otherTurnover = Number(v('business.otherTurnover') ?? 0);
    const adOther = Number(d.adOtherMode || 0);
    const receipts = num(v('business.professionalReceipts'));
    const adaCash = Number(d.adaCash || 0);
    const hasAd = Number(v('business.digitalTurnover') ?? 0) + otherTurnover > 0;
    const fin = { capital: num(d.capital), sundryCreditors: num(d.sundryCreditors), inventories: num(d.inventories), sundryDebtors: num(d.sundryDebtors), bank: num(d.bankBalance), cashInHand: num(d.cashInHand) };
    exp.run({
      ...personBody(d),
      person: { ...personBody(d).person, employerCategory: gross ? 'OTH' : 'NA' },
      filing: { section, regime, ...(regime === 'OLD' && d.form10IEAAck ? { form10IEA: { assessmentYear: '2026-27', ack: d.form10IEAAck, date: d.form10IEADate || undefined } } : {}) },
      salary: gross ? { gross, professionalTax: num(v('salary.professionalTax')), employers: d.employerTan ? [{ tan: d.employerTan.toUpperCase(), name: d.employerName ?? '', incomeChargeable: Math.max(0, gross - (regime === 'NEW' ? 75000 : 50000)), tds: Number(d.salaryTds || 0) }] : [] } : undefined,
      house: v('house.rent') ? { letOut: true, address: `${d.residenceNo ?? ''}, ${d.locality ?? ''}`.slice(0, 50), city: d.city ?? '', stateCode: d.stateCode ?? '', pin: d.pin ?? '', rent: num(v('house.rent')), municipalTax: num(v('house.municipalTax')) } : undefined,
      otherSources: { savingsInterest: num(v('otherSources.savingsInterest')), depositInterest: num(v('otherSources.depositInterest')), dividends: num(v('otherSources.dividends')), other: num(v('otherSources.other')) },
      ltcg112A: v('capitalGains.equityLongTerm') ? { saleValue: Number(v('capitalGains.equityLongTerm')), cost: 0 } : undefined,
      business: {
        ad: hasAd ? { code: d.adCode ?? '', name: d.adName || 'Business', digital: Number(v('business.digitalTurnover') ?? 0), cash: Math.max(0, otherTurnover - adOther), otherMode: adOther } : undefined,
        ada: receipts ? { code: d.adaCode ?? '', name: d.adaName || 'Profession', digital: Math.max(0, receipts - adaCash), cash: adaCash } : undefined,
        financials: Object.fromEntries(Object.entries(fin).filter(([, x]) => x !== undefined)),
      },
      deductions: regime === 'OLD' && v('deductions.section80C') ? { section80C: [{ amount: Number(v('deductions.section80C')), id: 'As per proofs' }], section80CCD1B: num(v('deductions.npsSelf')) } : undefined,
    });
  };

  return (
    <section className="pos-card space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-pos-ink"><FileJson className="h-4 w-4 text-pos-accent" /> ITR-4 return file, Assessment Year 2026-27</h2>
      <p className="text-[13px] text-pos-ink/65">For presumptive income of 2025-26 under 44AD (turnover up to ₹2 crore, or ₹3 crore with cash up to 5%) and 44ADA (receipts up to ₹50 lakh, or ₹75 lakh), with total income up to ₹50 lakh. Written to the Department&apos;s ITR-4 schema, version 1.1 of 30 Jun 2026. The due date is 31 Aug 2026. Goods carriages under 44AE are accepted by the API but not entered here.</p>
      <div className="flex flex-wrap gap-4 text-[13px] text-pos-ink/70"><RegimeAndSection regime={regime} setRegime={setRegime} section={section} setSection={setSection} /></div>
      <FilledFrom fills={filled} />
      <Fields fields={PERSON_FIELDS} d={d} setD={setD} />
      <Fields fields={BUSINESS_FIELDS} d={d} setD={setD} />
      <button type="button" onClick={make} disabled={exp.busy} className="rounded-full bg-pos-accent px-4 py-2 text-[13.5px] text-white disabled:opacity-50">{configured ? 'Download ITR-4 JSON' : 'Check ITR-4'}</button>
      <ExportResult state={exp} configured={configured} />
    </section>
  );
}
