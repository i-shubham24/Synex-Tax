'use client';

import React, { useState } from 'react';
import { Itr1Export } from './Itr1Export';
import { Itr2Export } from './Itr2Export';
import { Itr4Export } from './Itr4Export';

type Form = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';

/** Suggests the return from the figures entered (Rule 12 of the Income-tax Rules sets who files which form). */
export function suggestForm(values: Record<string, string>): Form {
  const has = (k: string) => Number(values[k] || 0) > 0;
  if (has('business.actualProfit')) return 'ITR-3';
  const presumptive = has('business.digitalTurnover') || has('business.otherTurnover') || has('business.professionalReceipts');
  const gains = has('capitalGains.equityShortTerm') || has('capitalGains.otherLongTerm') || has('capitalGains.otherShortTerm') || Number(values['capitalGains.equityLongTerm'] || 0) > 125000;
  if (presumptive) return gains ? 'ITR-3' : 'ITR-4';
  if (gains || has('salary.hraReceived')) return 'ITR-2';
  return 'ITR-1';
}

const LABEL: Record<Form, string> = { 'ITR-1': 'ITR-1 Sahaj', 'ITR-2': 'ITR-2', 'ITR-3': 'ITR-3', 'ITR-4': 'ITR-4 Sugam' };

export function ItrFormPicker({ values, age }: { values: Record<string, string>; age: string }) {
  const suggested = suggestForm(values);
  const [chosen, setChosen] = useState<Form | null>(null);
  const form = chosen ?? suggested;
  return (
    <div className="space-y-3">
      <div className="pos-card flex flex-wrap items-center gap-2 p-4 text-[13px] text-pos-ink/70">
        <span className="mr-2 font-semibold text-pos-ink">Return form</span>
        {(Object.keys(LABEL) as Form[]).map((f) => (
          <button key={f} type="button" onClick={() => setChosen(f)} aria-pressed={form === f}
            className={`rounded-full border px-3 py-1.5 ${form === f ? 'border-pos-accent bg-pos-accent text-white' : 'border-pos-line bg-pos-surface text-pos-ink'}`}>
            {LABEL[f]}{f === suggested ? ' (suggested)' : ''}
          </button>
        ))}
      </div>
      {form === 'ITR-1' && <Itr1Export values={values} age={age} />}
      {form === 'ITR-2' && <Itr2Export values={values} />}
      {form === 'ITR-4' && <Itr4Export values={values} />}
      {form === 'ITR-3' && (
        <section className="pos-card p-4 text-[13px] text-pos-ink/70">
          <h2 className="text-[15px] font-semibold text-pos-ink">ITR-3, Assessment Year 2026-27</h2>
          <p className="mt-1">The Department has published the ITR-3 schema (version 1.1), but this file is not prepared here yet. File business income from accounts, or presumptive income with capital gains beyond the ITR-4 limit, through the Department&apos;s utility.</p>
        </section>
      )}
    </div>
  );
}
