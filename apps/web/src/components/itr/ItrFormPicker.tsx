'use client';

import React, { useState } from 'react';
import { Itr1Export } from './Itr1Export';
import { Itr2Export } from './Itr2Export';
import { Itr3Export } from './Itr3Export';
import { Itr4Export } from './Itr4Export';
import { Itr5Export } from './Itr5Export';
import { Itr6Export } from './Itr6Export';
import { ItrUExport } from './ItrUExport';
import { selectCls } from './itrShared';
import { useItrDraft } from './itrDraftStore';

export type Form = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4' | 'ITR-5' | 'ITR-6' | 'ITR-U';
export type Taxpayer = 'INDIVIDUAL' | 'FIRM' | 'COMPANY';

/** Suggests the return from the figures entered (Rule 12 of the Income-tax Rules sets who files which form). */
export function suggestForm(values: Record<string, string>): Form {
  const has = (k: string) => Number(values[k] || 0) > 0;
  if (has('business.actualProfit')) return 'ITR-3';
  const presumptive = has('business.digitalTurnover') || has('business.otherTurnover') || has('business.professionalReceipts');
  const gains = has('capitalGains.equityShortTerm') || has('capitalGains.otherLongTerm') || has('capitalGains.otherShortTerm') || Number(values['capitalGains.equityLongTerm'] || 0) > 125000;
  // ITR-4 takes presumptive income only within section 44AD (turnover up to Rs 3 crore) and 44ADA (receipts up to Rs 75 lakh); above these, business income goes in ITR-3.
  const turnover = Number(values['business.digitalTurnover'] || 0) + Number(values['business.otherTurnover'] || 0);
  const overLimits = turnover > 30000000 || Number(values['business.professionalReceipts'] || 0) > 7500000;
  if (presumptive) return gains || overLimits ? 'ITR-3' : 'ITR-4';
  if (gains || has('salary.hraReceived')) return 'ITR-2';
  return 'ITR-1';
}

export const LABEL: Record<Form, string> = { 'ITR-1': 'ITR-1 Sahaj', 'ITR-2': 'ITR-2', 'ITR-3': 'ITR-3', 'ITR-4': 'ITR-4 Sugam', 'ITR-5': 'ITR-5', 'ITR-6': 'ITR-6', 'ITR-U': 'Updated return (ITR-U)' };
// Rule 12: ITR-5 for firms and LLPs; ITR-6 for companies not claiming section 11.
export const FORMS: Record<Taxpayer, Form[]> = { INDIVIDUAL: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-U'], FIRM: ['ITR-5'], COMPANY: ['ITR-6'] };

/** The form to use for a taxpayer: the one chosen if it fits, otherwise the suggestion. */
export function formFor(taxpayer: Taxpayer, values: Record<string, string>, chosen: Form | null): Form {
  const suggested: Form = taxpayer === 'INDIVIDUAL' ? suggestForm(values) : taxpayer === 'FIRM' ? 'ITR-5' : 'ITR-6';
  return chosen && FORMS[taxpayer].includes(chosen) ? chosen : suggested;
}

/**
 * The return forms. The taxpayer and the chosen form can be held by the page (so the saved return and the
 * form shown agree); without them the picker keeps its own. Every form reads the imports on the page.
 */
export function ItrFormPicker({ values, age, taxpayer: tp, setTaxpayer: setTp, chosen: ch, setChosen: setCh }: {
  values: Record<string, string>; age: string;
  taxpayer?: Taxpayer; setTaxpayer?: (t: Taxpayer) => void; chosen?: Form | null; setChosen?: (f: Form | null) => void;
}) {
  const [ownTaxpayer, setOwnTaxpayer] = useState<Taxpayer>('INDIVIDUAL');
  const [ownChosen, setOwnChosen] = useState<Form | null>(null);
  const taxpayer = tp ?? ownTaxpayer;
  const setTaxpayer = setTp ?? setOwnTaxpayer;
  const chosen = ch === undefined ? ownChosen : ch;
  const setChosen = setCh ?? setOwnChosen;
  const suggested: Form = taxpayer === 'INDIVIDUAL' ? suggestForm(values) : taxpayer === 'FIRM' ? 'ITR-5' : 'ITR-6';
  const form = formFor(taxpayer, values, chosen);
  const { draft } = useItrDraft();
  return (
    <div className="space-y-3">
      <div className="pos-card flex flex-wrap items-center gap-2 p-4 text-[13px] text-pos-ink/70">
        <label className="mr-2 flex items-center gap-2 font-semibold text-pos-ink">Taxpayer
          <select value={taxpayer} onChange={(e) => { setTaxpayer(e.target.value as Taxpayer); setChosen(null); }} className={`${selectCls} font-normal`}>
            <option value="INDIVIDUAL">Individual or HUF</option><option value="FIRM">Firm or LLP</option><option value="COMPANY">Company</option>
          </select>
        </label>
        <span className="mr-2 font-semibold text-pos-ink">Return form</span>
        {FORMS[taxpayer].map((f) => (
          <button key={f} type="button" onClick={() => setChosen(f)} aria-pressed={form === f}
            className={`rounded-full border px-3 py-1.5 ${form === f ? 'border-pos-accent bg-pos-accent text-white' : 'border-pos-line bg-pos-surface text-pos-ink'}`}>
            {LABEL[f]}{f === suggested ? ' (suggested)' : ''}
          </button>
        ))}
      </div>
      {draft.log.length > 0 && (
        <p className="text-[12px] text-pos-ink/70">Imports this session: {draft.log.map((l) => `${l.source} (${l.what})`).join('; ')}. Each form below fills its empty fields from them.</p>
      )}
      {form === 'ITR-1' && <Itr1Export values={values} age={age} />}
      {form === 'ITR-2' && <Itr2Export values={values} />}
      {form === 'ITR-4' && <Itr4Export values={values} />}
      {form === 'ITR-3' && <Itr3Export values={values} />}
      {form === 'ITR-5' && <Itr5Export />}
      {form === 'ITR-6' && <Itr6Export />}
      {form === 'ITR-U' && <ItrUExport values={values} />}
    </div>
  );
}
